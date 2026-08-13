/* Extraordinary Fantasy Gentlemen - Roster Doctor Add-on
   Add this script after the main site script, before </body>:
   <script src="roster_doctor_addon.js"></script>
*/
(function(){
  const DOCTOR_STARTERS = { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, DEF: 1 };
  const DOCTOR_PRIORITY_POSITIONS = ['RB','WR','QB','TE','DEF'];

  function css(){
    const style=document.createElement('style');
    style.textContent=`
      .doctor-textarea{width:100%;min-height:220px;resize:vertical;background:rgba(255,255,255,.08);border:1px solid var(--line);border-radius:14px;color:var(--text);padding:12px;outline:none;line-height:1.4}
      .doctor-grade{display:inline-flex;align-items:center;justify-content:center;min-width:54px;height:42px;border-radius:14px;background:rgba(215,181,109,.18);border:1px solid rgba(215,181,109,.35);color:var(--cream);font-weight:900;font-size:20px;margin-right:8px}
      .doctor-list{margin:0;padding:0;list-style:none}.doctor-list li{border-top:1px solid var(--line);padding:10px 0}
      .doctor-score-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--line)}
      .doctor-mini-card{padding:10px;border-radius:14px;background:rgba(255,255,255,.055);border:1px solid var(--line);margin:8px 0}
    `;
    document.head.appendChild(style);
  }

  function installTab(){
    if(document.getElementById('rosterdoctor')) return;
    const main=document.querySelector('main.main');
    const nav=document.getElementById('nav');
    if(!main||!nav||!window.DATA) return;

    const btn=document.createElement('button');
    btn.textContent='Roster Doctor';
    btn.onclick=function(){showTab('rosterdoctor',btn)};
    nav.appendChild(btn);

    const section=document.createElement('section');
    section.className='tab';
    section.id='rosterdoctor';
    section.innerHTML=`
      <div class="card">
        <h2>🏥 Roster Doctor</h2>
        <p class="notice">Upload or paste a Yahoo roster screenshot/text and the Roster Doctor will assess team balance, identify needs, recommend free agent targets, and suggest trade fits. Screenshot OCR is best-effort, so pasted roster text is the most reliable input.</p>
        <p class="muted">Roster Doctor uses Big Board data and projected keepers. It does not verify live Yahoo free-agent availability or submit trades.</p>
        <div class="grid">
          <div class="card"><h3>1. My Roster</h3><p class="muted">Upload a screenshot or paste roster text copied from Yahoo.</p><div class="controls"><input type="file" id="myRosterImage" accept="image/*"><button class="btn secondary" onclick="ocrRosterImage('my')">Read screenshot</button></div><textarea id="myRosterText" class="doctor-textarea" placeholder="Paste my roster text here. Example:\nQB Josh Allen\nRB Bucky Irving\nWR Puka Nacua\nTE Tyler Warren\nBN Blake Corum"></textarea></div>
          <div class="card"><h3>2. Trade Partner Roster Optional</h3><p class="muted">Upload or paste a second roster to generate trade ideas.</p><div class="controls"><input type="file" id="partnerRosterImage" accept="image/*"><button class="btn secondary" onclick="ocrRosterImage('partner')">Read screenshot</button></div><textarea id="partnerRosterText" class="doctor-textarea" placeholder="Paste trade partner roster text here if you want trade recommendations."></textarea></div>
        </div>
        <div class="controls" style="margin-top:14px"><select id="doctorTeamSelect"><option value="">Select my EFG team optional</option></select><select id="doctorSortMode"><option value="yahoo">Prioritise Yahoo ADP</option><option value="fp">Prioritise FantasyPros ADP</option><option value="value">Prioritise consensus value</option></select><button class="btn" onclick="runRosterDoctor()">Diagnose Team</button><button class="btn secondary" onclick="clearRosterDoctor()">Clear</button></div>
        <div id="ocrStatus" class="muted"></div>
      </div><br>
      <div class="grid"><div class="card"><h2>Team Health Check</h2><div id="doctorHealth"></div></div><div class="card"><h2>Waiver / Free Agent Targets</h2><div id="doctorWaivers"></div></div></div><br>
      <div class="grid"><div class="card"><h2>Trade Doctor</h2><div id="doctorTrades"></div></div><div class="card"><h2>Keeper Lens</h2><div id="doctorKeeperLens"></div></div></div>`;
    main.appendChild(section);
    initRosterDoctor();
  }

  function initRosterDoctor(){
    const select=document.getElementById('doctorTeamSelect');
    if(!select||!DATA||!DATA.teams) return;
    select.innerHTML='<option value="">Select my EFG team optional</option>'+DATA.teams.map(t=>`<option value="${t.team}">${t.team}</option>`).join('');
  }

  function normaliseDoctorName(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
  function projectedKeeperSet(){return new Set(DATA.keepers.map(k=>normaliseDoctorName(k.player)))}

  function extractRosterPlayers(text){
    const lines=String(text||'').split(/\n|,/).map(x=>x.trim()).filter(Boolean);
    const found=[]; const seen=new Set();
    for(const line of lines){
      const cleaned=line.replace(/\b(QB|RB|WR|TE|DEF|BN|IR|W\/R\/T|FLEX|K)\b/gi,' ').replace(/\s+/g,' ').trim();
      const lineKey=normaliseDoctorName(cleaned);
      for(const player of DATA.players){
        if(!player || !player.name || !player.pos) continue;
        const key=normaliseDoctorName(player.name); if(!key||seen.has(key)) continue;
        const lastName=normaliseDoctorName(player.name.split(' ').slice(-1)[0]);
        if(lineKey.includes(key)||(lastName.length>4&&lineKey.includes(lastName))){found.push({...player,matchedText:line});seen.add(key)}
      }
    }
    return found;
  }

  function classifyRoster(roster){
    const groups={}; DOCTOR_PRIORITY_POSITIONS.forEach(pos=>groups[pos]=[]);
    roster.forEach(p=>{const pos=p.pos||'UNKNOWN'; if(!groups[pos]) groups[pos]=[]; groups[pos].push(p)});
    Object.keys(groups).forEach(pos=>groups[pos].sort((a,b)=>(a.yahoo??9999)-(b.yahoo??9999)));
    return groups;
  }

  function positionGrade(pos,count,bestRank){
    if(pos==='DEF') return count>=1?'B':'D';
    const starterNeed=DOCTOR_STARTERS[pos]||1;
    if(count===0) return 'F'; if(count<starterNeed) return 'D';
    if(bestRank<=24&&count>=starterNeed+1) return 'A';
    if(bestRank<=48&&count>=starterNeed) return 'B';
    if(count>=starterNeed) return 'C+'; return 'C';
  }

  function assessRoster(roster){
    const groups=classifyRoster(roster);
    const scores=DOCTOR_PRIORITY_POSITIONS.map(pos=>{const players=groups[pos]||[];const bestRank=players.length?Math.min(...players.map(p=>p.yahoo??9999)):9999;return{pos,count:players.length,bestRank,grade:positionGrade(pos,players.length,bestRank),players}});
    return{groups,scores,strengths:scores.filter(s=>['A','B'].some(g=>s.grade.startsWith(g))).map(s=>s.pos),weaknesses:scores.filter(s=>['D','F','C+'].includes(s.grade)).map(s=>s.pos)};
  }

  function calculateOverallGrade(assessment){
    const points={'A':5,'A-':4.7,'B+':4.3,'B':4,'C+':3.2,'C':3,'D':2,'F':1};
    const avg=assessment.scores.reduce((sum,s)=>sum+(points[s.grade]||3),0)/assessment.scores.length;
    if(avg>=4.6)return'A-'; if(avg>=4.2)return'B+'; if(avg>=3.8)return'B'; if(avg>=3.2)return'C+'; if(avg>=2.6)return'C'; return'D';
  }

  function renderHealthAssessment(assessment,roster){
    if(!roster.length) return '<p class="muted">No players detected. Paste roster text or upload a clearer screenshot.</p>';
    const overall=calculateOverallGrade(assessment);
    return `<div><span class="doctor-grade">${overall}</span><span class="muted">Overall roster health</span></div><br><h3>Detected players</h3>${roster.map(p=>`<span class="pill"><span class="pos-badge ${posClass(p.pos)}">${p.pos}</span> ${p.name}</span>`).join('')}<br><br><h3>Positional Grades</h3>${assessment.scores.map(s=>`<div class="doctor-score-row"><span><span class="pos-badge ${posClass(s.pos)}">${s.pos}</span> ${s.count} players</span><b>${s.grade}</b></div>`).join('')}<br><h3>Strengths</h3>${assessment.strengths.length?assessment.strengths.map(p=>`<span class="pill green">${p}</span>`).join(''):'<p class="muted">No clear strengths detected from the roster input.</p>'}<h3>Weaknesses</h3>${assessment.weaknesses.length?assessment.weaknesses.map(p=>`<span class="pill red">${p}</span>`).join(''):'<p class="muted">No major weaknesses detected.</p>'}`;
  }

  function recommendWaivers(roster,assessment){
    const rosterNames=new Set(roster.map(p=>normaliseDoctorName(p.name))); const keeperNames=projectedKeeperSet();
    const needPositions=assessment.weaknesses.length?assessment.weaknesses:['RB','WR'];
    let candidates=DATA.players.filter(p=>p&&p.name&&p.pos&&!rosterNames.has(normaliseDoctorName(p.name))&&!keeperNames.has(normaliseDoctorName(p.name))&&needPositions.includes(p.pos));
    const mode=document.getElementById('doctorSortMode')?.value||'yahoo';
    candidates.sort((a,b)=>mode==='fp'?(a.fantasyPros??9999)-(b.fantasyPros??9999):(mode==='value'?(a.consensus??a.yahoo??9999)-(b.consensus??b.yahoo??9999):(a.yahoo??9999)-(b.yahoo??9999)));
    return candidates.slice(0,10);
  }

  function renderWaivers(candidates,assessment){
    if(!candidates.length) return '<p class="muted">No waiver candidates found from the current Big Board pool.</p>';
    const needs=assessment.weaknesses.length?assessment.weaknesses.join(', '):'best available depth';
    return `<p class="muted">Recommended based on roster needs: <b>${needs}</b>. These are Big Board candidates not detected on the uploaded roster and not projected keepers, not verified Yahoo free agents.</p><ul class="doctor-list">${candidates.map((p,i)=>`<li><b>${i+1}. ${p.name}</b> <span class="pos-badge ${posClass(p.pos)}">${p.pos}</span><div class="muted">Yahoo ADP: ${fmt(p.yahoo)} · FantasyPros: ${fmt(p.fantasyPros)}</div><div>Why: Adds depth or upside at a current need position.</div></li>`).join('')}</ul>`;
  }

  function recommendTrades(myRoster,partnerRoster,myAssessment,partnerAssessment){
    if(!partnerRoster.length) return [];
    const myNeeds=new Set(myAssessment.weaknesses); const partnerNeeds=new Set(partnerAssessment.weaknesses);
    const partnerGroups=classifyRoster(partnerRoster); const myGroups=classifyRoster(myRoster);
    const targets=[];
    for(const need of myNeeds){
      (partnerGroups[need]||[]).slice(0,5).forEach(target=>{const mySurplusPos=myAssessment.strengths.find(pos=>partnerNeeds.has(pos)); const offerPool=mySurplusPos?(myGroups[mySurplusPos]||[]):[]; targets.push({target,need,offerPos:mySurplusPos,offerExample:offerPool[offerPool.length-1],fitScore:calculateTradeFitScore(target,need,mySurplusPos)})});
    }
    return targets.sort((a,b)=>b.fitScore-a.fitScore).slice(0,8);
  }
  function calculateTradeFitScore(target,need,offerPos){let score=5;if(target.yahoo&&target.yahoo<=60)score+=2;if(offerPos)score+=2;if(['RB','WR'].includes(need))score+=1;return Math.min(score,10)}
  function renderTrades(trades,partnerRoster){
    if(!partnerRoster.length) return '<p class="muted">Upload or paste a trade partner roster to generate trade recommendations.</p>';
    if(!trades.length) return '<p class="muted">No obvious trade fit detected from the two roster inputs.</p>';
    return `<ul class="doctor-list">${trades.map(t=>`<li><b>Target: ${t.target.name}</b> <span class="pos-badge ${posClass(t.target.pos)}">${t.target.pos}</span><div class="muted">Fit score: ${t.fitScore}/10 · Need addressed: ${t.need}</div><div>${t.offerExample?`Potential offer angle: use ${t.offerExample.name} or another ${t.offerPos} depth piece.`:'Potential offer angle: add a depth player or draft pick sweetener.'}</div></li>`).join('')}</ul>`;
  }

  function renderKeeperLens(roster){
    const keeperMap=new Map(DATA.keepers.map(k=>[normaliseDoctorName(k.player),k]));
    const assets=roster.map(p=>{const keeper=keeperMap.get(normaliseDoctorName(p.name));return keeper?{...p,keeper}:null}).filter(Boolean);
    if(!assets.length) return '<p class="muted">No projected keeper assets detected on this roster.</p>';
    return `<ul class="doctor-list">${assets.map(a=>`<li><b>${a.name}</b> <span class="pos-badge ${posClass(a.pos)}">${a.pos}</span><div class="muted">Keeper cost: Round ${a.keeper.costRound} · Yahoo ADP: ${fmt(a.yahoo)}</div><div>Keeper value: <span class="${(a.keeper.valueRounds??0)>0?'good':'bad'}">${(a.keeper.valueRounds??0)>0?'+':''}${a.keeper.valueRounds??'—'} rounds</span></div></li>`).join('')}</ul>`;
  }

  async function loadTesseract(){
    if(window.Tesseract) return true;
    return new Promise(resolve=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=()=>resolve(true);s.onerror=()=>resolve(false);document.head.appendChild(s)});
  }
  window.ocrRosterImage = async function(type){
    const input=document.getElementById(type==='my'?'myRosterImage':'partnerRosterImage'); const output=document.getElementById(type==='my'?'myRosterText':'partnerRosterText'); const status=document.getElementById('ocrStatus');
    if(!input.files||!input.files[0]){status.textContent='Select a roster screenshot first.';return}
    status.textContent='Loading OCR library...'; const ok=await loadTesseract(); if(!ok||!window.Tesseract){status.textContent='OCR library is not available. Paste roster text manually instead.';return}
    status.textContent='Reading screenshot. Results may need manual clean-up.';
    try{const result=await Tesseract.recognize(input.files[0],'eng'); output.value=result.data.text; status.textContent='Screenshot read complete. Review the text before diagnosing.'}catch(err){status.textContent='Could not read screenshot. Paste roster text manually instead.'}
  };

  window.runRosterDoctor = function(){
    const myRoster=extractRosterPlayers(document.getElementById('myRosterText').value); const partnerRoster=extractRosterPlayers(document.getElementById('partnerRosterText').value);
    const myAssessment=assessRoster(myRoster); const partnerAssessment=assessRoster(partnerRoster);
    document.getElementById('doctorHealth').innerHTML=renderHealthAssessment(myAssessment,myRoster);
    document.getElementById('doctorWaivers').innerHTML=renderWaivers(recommendWaivers(myRoster,myAssessment),myAssessment);
    document.getElementById('doctorTrades').innerHTML=renderTrades(recommendTrades(myRoster,partnerRoster,myAssessment,partnerAssessment),partnerRoster);
    document.getElementById('doctorKeeperLens').innerHTML=renderKeeperLens(myRoster);
  };
  window.clearRosterDoctor = function(){['myRosterText','partnerRosterText'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});['doctorHealth','doctorWaivers','doctorTrades','doctorKeeperLens'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=''});const status=document.getElementById('ocrStatus');if(status)status.textContent=''};

  function boot(){css();installTab()}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
