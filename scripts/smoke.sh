#!/usr/bin/env bash
# Backend uçlarını uçtan uca dener. Kullanım: bash scripts/smoke.sh [BASE_URL]
set -euo pipefail
BASE="${1:-http://localhost:3000}"
SAMPLES="$(cd "$(dirname "$0")/.." && pwd)/samples"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "1) /api/health — model bağlantısı"
curl -sS "$BASE/api/health" | head -c 600; echo

step "2) /api/rubric/parse (GET) — varsayılan rubric şablonu"
curl -sS "$BASE/api/rubric/parse" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).rubric;
console.log(r.title,'|',r.totalPoints,'puan |',r.criteria.length,'kriter:',r.criteria.map(c=>c.id).join(', '));});"

step "3) /api/extract — .txt dosyasından metin çıkarma"
curl -sS -F "file=@$SAMPLES/essay.txt" -F "kind=essay" "$BASE/api/extract" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);
console.log(JSON.stringify({format:r.format,words:r.words,chars:r.chars,warnings:r.warnings}));});"

step "4) /api/rubric/parse (POST) — serbest metin rubric → JSON"
SAMPLES="$SAMPLES" node -e "
const fs=require('fs');
const text=fs.readFileSync(process.env.SAMPLES+'/rubric.txt','utf8');
fs.writeFileSync('/tmp/eg_rubric_req.json',JSON.stringify({text}));"
curl -sS -X POST "$BASE/api/rubric/parse" -H 'content-type: application/json' \
  --data @/tmp/eg_rubric_req.json > /tmp/eg_rubric_res.json
node -e "
const r=require('/tmp/eg_rubric_res.json');
if(r.error){console.error('HATA:',r.error);process.exit(1);}
console.log(r.rubric.title,'|',r.rubric.totalPoints,'puan');
for(const c of r.rubric.criteria) console.log('  -',c.id,'|',c.name,'|',c.maxScore,'puan | ağırlık',c.weight,'|',c.levels.length,'seviye');
if(r.warnings.length) console.log('  uyarılar:',r.warnings);"

step "5) /api/grade/criterion — her kriter ayrı ve paralel"
SAMPLES="$SAMPLES" node -e "
const fs=require('fs');
const rubric=require('/tmp/eg_rubric_res.json').rubric;
const essay=fs.readFileSync(process.env.SAMPLES+'/essay-weak.txt','utf8');
for (const c of rubric.criteria) {
  fs.writeFileSync('/tmp/eg_crit_'+c.id+'.json', JSON.stringify({
    rubric, criterionId:c.id, essay, essayTitle:'Phones in School',
    language:'tr', strictness:'strict'}));
}
fs.writeFileSync('/tmp/eg_ids.txt', rubric.criteria.map(c=>c.id).join('\\n'));"

for id in $(cat /tmp/eg_ids.txt); do
  curl -sS -X POST "$BASE/api/grade/criterion" -H 'content-type: application/json' \
    --data @/tmp/eg_crit_$id.json -o /tmp/eg_res_$id.json &
done
wait
node -e "
const fs=require('fs');
const ids=fs.readFileSync('/tmp/eg_ids.txt','utf8').split('\\n').filter(Boolean);
const results=ids.map(id=>JSON.parse(fs.readFileSync('/tmp/eg_res_'+id+'.json','utf8')));
const bad=results.find(r=>r.error);
if(bad){console.error('HATA:',bad.error);process.exit(1);}
let total=0, max=0, q=0, qv=0;
for(const r of results){
  total+=r.score; max+=r.maxScore; q+=r.quotesTotal; qv+=r.quotesVerified;
  console.log('  '+r.name+': '+r.score+'/'+r.maxScore+(r.level?' ('+r.level+')':''));
  for(const e of r.evidence) console.log('    ['+(e.verified?'✓':'✗ DOĞRULANAMADI')+'] \"'+e.quote.replace(/\n/g,' ').slice(0,70)+'\"');
  for(const w of r.warnings) console.log('    uyarı: '+w);
}
console.log('  TOPLAM: '+total+'/'+max+' | alıntı doğrulama: '+qv+'/'+q);
fs.writeFileSync('/tmp/eg_summary_req.json', JSON.stringify({
  rubric: require('/tmp/eg_rubric_res.json').rubric,
  results: results.map(({quotesTotal,quotesVerified,warnings,...rest})=>rest),
  essayTitle:'Phones in School', language:'tr'}));"

step "6) /api/grade/summary — öğrenci özeti ve öğretmen notları"
curl -sS -X POST "$BASE/api/grade/summary" -H 'content-type: application/json' \
  --data @/tmp/eg_summary_req.json | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);
if(r.error){console.error('HATA:',r.error);process.exit(1);}
console.log('Genel:',r.verdict,'|',r.letterGrade??'-');
console.log('\\nÖĞRENCİ ÖZETİ:\\n'+r.studentSummary);
console.log('\\nÖĞRETMEN NOTU:\\n'+r.teacherNotes);
console.log('\\nSONRAKİ ADIMLAR:'); r.nextSteps.forEach(x=>console.log('  -',x));});"

step "7) JPEG rubric → metin (modelin görme yeteneğiyle)"
curl -sS -F "file=@$SAMPLES/rubric.jpg" -F "kind=rubric" "$BASE/api/extract" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);
if(r.error){console.error('HATA:',r.error);process.exit(1);}
console.log(r.format,'|',r.words,'kelime | uyarı:',r.warnings.length?r.warnings:'yok');
console.log(r.text.split('\\n')[0]);});"

printf '\n\033[1mTamamlandı.\033[0m\n'
