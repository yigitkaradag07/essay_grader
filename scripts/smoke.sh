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

step "5) /api/grade — makaleyi rubric'e göre notlandır"
SAMPLES="$SAMPLES" node -e "
const fs=require('fs');
const rubric=require('/tmp/eg_rubric_res.json').rubric;
const essay=fs.readFileSync(process.env.SAMPLES+'/essay.txt','utf8');
fs.writeFileSync('/tmp/eg_grade_req.json',JSON.stringify({rubric,essay,essayTitle:'Should Schools Ban Smartphones?',language:'tr',strictness:'balanced'}));"
curl -sS -X POST "$BASE/api/grade" -H 'content-type: application/json' \
  --data @/tmp/eg_grade_req.json > /tmp/eg_grade_res.json
node -e "
const r=require('/tmp/eg_grade_res.json');
if(r.error){console.error('HATA:',r.error,r.detail??'');process.exit(1);}
console.log('NOT:',r.overall.score+'/'+r.overall.maxScore,'('+r.overall.percentage+'%)',r.overall.letterGrade??'');
console.log('Genel:',r.overall.verdict,'\n');
for(const c of r.criteria){
  console.log(c.name+': '+c.score+'/'+c.maxScore+(c.level?' ('+c.level+')':''));
  console.log('  gerekçe:',c.justification);
  for(const e of c.evidence) console.log('  ['+(e.verified?'✓ doğrulandı':'✗ DOĞRULANAMADI')+'] \"'+e.quote.slice(0,80)+'\" → '+e.comment.slice(0,90));
}
console.log('\nÖĞRENCİ ÖZETİ:\n'+r.studentSummary);
console.log('\nÖĞRETMEN NOTU:\n'+r.teacherNotes);
console.log('\nSONRAKİ ADIMLAR:'); r.nextSteps.forEach(s=>console.log('  -',s));
console.log('\nMETA:',JSON.stringify({model:r.meta.model,alıntı:r.meta.quotesVerified+'/'+r.meta.quotesTotal,kelime:r.meta.essayWords}));
if(r.meta.warnings.length){console.log('UYARILAR:');r.meta.warnings.forEach(w=>console.log('  -',w));}"

step "6) JPEG rubric → metin (modelin görme yeteneğiyle)"
curl -sS -F "file=@$SAMPLES/rubric.jpg" -F "kind=rubric" "$BASE/api/extract" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);
if(r.error){console.error('HATA:',r.error);process.exit(1);}
console.log(r.format,'|',r.words,'kelime | uyarı:',r.warnings.length?r.warnings:'yok');
console.log(r.text.split('\\n')[0]);});"

step "7) rubric'i kaydet, aktif yap ve gövdesiz notlandır"
node -e "
const r=require('/tmp/eg_rubric_res.json');
require('fs').writeFileSync('/tmp/eg_save.json',JSON.stringify({rubric:r.rubric,activate:true}));"
curl -sS -X POST "$BASE/api/rubrics" -H 'content-type: application/json' --data @/tmp/eg_save.json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);
console.log('kaydedildi:',r.rubric.title,'| aktif:',r.isActive);});"
SAMPLES="$SAMPLES" node -e "
const fs=require('fs');
fs.writeFileSync('/tmp/eg_active_req.json',JSON.stringify({
  essay:fs.readFileSync(process.env.SAMPLES+'/essay-weak.txt','utf8'),
  essayTitle:'Phones in School',language:'tr',strictness:'strict'}));"
curl -sS -X POST "$BASE/api/grade" -H 'content-type: application/json' --data @/tmp/eg_active_req.json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);
if(r.error){console.error('HATA:',r.error);process.exit(1);}
console.log('kullanılan rubric:',r.rubricTitle);
console.log('zayıf makale (strict):',r.overall.score+'/'+r.overall.maxScore,r.overall.letterGrade??'');
console.log('alıntı doğrulama:',r.meta.quotesVerified+'/'+r.meta.quotesTotal);});"

printf '\n\033[1mTamamlandı.\033[0m\n'
