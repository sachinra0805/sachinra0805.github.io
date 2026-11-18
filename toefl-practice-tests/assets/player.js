/* Generic exam player: renders any test from its JSON data file.
   Simulates computer-based test software: directions screens, one question
   at a time, passage on the left / questions on the right, review screen,
   per-section timers on mock tests. Scores are reported per section to the
   VPS backend (same event contract as the original Test 1 page). */
(function(){
'use strict';
var DATA=null, S=null;
var DRAFT_KEY='examPlayerV1:'+(window.TEST_SLUG||'test');
var HIST_KEY='examHistoryV1:'+(window.TEST_SLUG||'test');
var timerInt=null;

/* ---------------- reporting (unchanged contract) ---------------- */
function reportEvent(ev){
  try{
    var h=location.hostname;
    if(!(h==='3.15.95.160'||h==='tensorcat.io'||/\.tensorcat\.io$/.test(h))) return;
    var body=JSON.stringify(ev);
    if(navigator.sendBeacon){ navigator.sendBeacon('/api/event', new Blob([body],{type:'application/json'})); }
    else{ fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){}); }
  }catch(e){}
}

/* ---------------- state ---------------- */
function freshState(){
  return { screen:'start', sectionIdx:0, qIdx:0, answers:{}, submitted:{},
           writing:{}, notes:{}, replays:{}, sectionStart:{}, deadline:{}, attemptComplete:false };
}
function loadState(){
  try{ var raw=localStorage.getItem(DRAFT_KEY); if(raw){ var s=JSON.parse(raw); if(s && s.answers) return s; } }catch(e){}
  return freshState();
}
function saveState(){ try{ localStorage.setItem(DRAFT_KEY, JSON.stringify(S)); }catch(e){} }
function clearState(){ try{ localStorage.removeItem(DRAFT_KEY); }catch(e){} S=freshState(); }
function loadHistory(){ try{ return JSON.parse(localStorage.getItem(HIST_KEY)||'[]'); }catch(e){ return []; } }
function pushHistory(rec){
  try{ var h=loadHistory(); h.unshift(rec); localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0,40))); }catch(e){}
}
function sec(){ return DATA.sections[S.sectionIdx]; }
function secAnswers(id){ if(!S.answers[id]) S.answers[id]=[]; return S.answers[id]; }
function isWriting(s){ return s.type==='writing'; }
function totalMinutes(){ return DATA.sections.reduce(function(a,s){return a+(s.minutes||0);},0); }
function totalQuestions(){ return DATA.sections.reduce(function(a,s){return a+(s.questions?s.questions.length:1);},0); }
function esc(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtClock(sec){
  sec=Math.max(0,Math.round(sec)); var m=Math.floor(sec/60), s=sec%60;
  return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}
function fmtDate(d){
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' · '+
         d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}

/* ---------------- chrome ---------------- */
function headerHtml(){
  return '<div class="exam-header"><span class="brand">'+esc(DATA.subject)+' Practice Tests</span>'+
    '<span class="test-name">'+esc(DATA.title)+' — '+esc(DATA.subtitle)+'</span>'+
    '<span class="spacer"></span><a href="../"><button class="hdr-btn" type="button">All tests</button></a></div>';
}
function toolbarHtml(right, mid){
  return '<div class="toolbar"><span class="sec-name">'+esc(right||'')+'</span>'+
    (mid?'<span class="q-count">'+esc(mid)+'</span>':'')+
    '<span class="timer" id="timer"></span></div>';
}
function app(){ return document.getElementById('app'); }

/* ---------------- screens ---------------- */
function render(){
  stopTimer();
  if(!DATA) return;
  var s=sec();
  if(S.screen==='start') return renderStart();
  if(S.screen==='directions') return renderDirections();
  if(S.screen==='audio') return renderAudio();
  if(S.screen==='question') return renderQuestion();
  if(S.screen==='review') return renderReview();
  if(S.screen==='sectionResult') return renderSectionResult();
  if(S.screen==='summary') return renderSummary();
}

function renderStart(){
  var rows=DATA.sections.map(function(s,i){
    var sub=S.submitted[s.id];
    var status, action;
    if(sub){ status='Completed — '+sub.score+' / '+sub.total+' ('+sub.pct+'%)'; }
    else if(S.answers[s.id] && S.answers[s.id].some(function(x){return x!==null&&x!==undefined;}) || (S.writing[s.id]&&S.writing[s.id].text)){ status='In progress'; }
    else { status='Not started'; }
    if(DATA.kind==='mini'){
      action='<button class="btn" type="button" onclick="P.startSection('+i+')">'+(sub?'Retake':'Start')+'</button>';
    } else { action=''; }
    var nQ = isWriting(s) ? '1 task' : (s.questions.length+' questions');
    return '<tr><td>'+esc(s.skill)+'</td><td>'+esc(s.title)+'</td><td>'+nQ+'</td><td>'+(s.minutes||'—')+' min</td><td class="status">'+esc(status)+'</td><td>'+action+'</td></tr>';
  }).join('');
  var hist=loadHistory();
  var histHtml = hist.length ?
    '<h2 style="font-size:18px;margin:28px 0 6px">Previous attempts on this device</h2>'+
    '<table class="history"><tr><th>Date</th><th>Section</th><th>Score</th></tr>'+
    hist.slice(0,10).map(function(h){ return '<tr><td>'+esc(h.dateLabel)+'</td><td>'+esc(h.test)+'</td><td>'+h.score+' / '+h.total+' · '+h.pct+'%</td></tr>'; }).join('')+'</table>'
    : '';
  var mainBtn='';
  if(DATA.kind==='mock'){
    var anyDone=Object.keys(S.submitted).length>0;
    if(S.attemptComplete){
      mainBtn='<div class="btn-row"><button class="btn primary" type="button" onclick="P.viewSummary()">View test summary</button>'+
              '<button class="btn" type="button" onclick="P.resetAll()">Start a new attempt</button></div>';
    } else {
      mainBtn='<div class="btn-row"><button class="btn primary" type="button" onclick="P.startSection('+firstOpenSection()+')">'+(anyDone?'Resume test':'Begin test')+'</button>'+
              (anyDone?'<button class="btn" type="button" onclick="P.resetAll()">Start over</button>':'')+'</div>';
    }
  } else {
    var doneCount=Object.keys(S.submitted).length;
    mainBtn = doneCount===DATA.sections.length ?
      '<div class="btn-row"><button class="btn primary" type="button" onclick="P.viewSummary()">View test summary</button>'+
      '<button class="btn" type="button" onclick="P.resetAll()">Start a new attempt</button></div>' : '';
  }
  app().innerHTML = headerHtml()+
    '<div class="main narrow"><div class="directions">'+
    '<p class="pane-label">'+esc(DATA.subject)+' · '+esc(DATA.kind==='mock'?'Mock test':'Mini practice set')+' · '+esc(DATA.level)+'</p>'+
    '<h1>'+esc(DATA.title)+' — '+esc(DATA.subtitle)+'</h1>'+
    '<p>'+esc(DATA.intro)+'</p>'+
    '<table class="sections"><tr><th>Skill</th><th>Section</th><th>Items</th><th>Time</th><th>Status</th><th></th></tr>'+rows+'</table>'+
    '<p class="small muted">Total: '+totalQuestions()+' items · about '+totalMinutes()+' minutes. '+
    (DATA.kind==='mock' ? 'Sections must be taken in order, in one sitting. Each section is timed; when time expires the section is submitted automatically.' :
                          'Take the sections in any order. Your progress is saved on this device if you stop midway.')+'</p>'+
    mainBtn+
    '</div>'+histHtml+
    '<footer class="site">Scores are recorded automatically when you finish each section.</footer></div>';
}
function firstOpenSection(){
  for(var i=0;i<DATA.sections.length;i++){ if(!S.submitted[DATA.sections[i].id]) return i; }
  return 0;
}

function renderDirections(){
  var s=sec();
  var nQ=isWriting(s)?'1 writing task':(s.questions.length+' questions');
  app().innerHTML = headerHtml()+toolbarHtml(s.skill+' Section','')+
    '<div class="main narrow"><div class="directions">'+
    '<h2>'+esc(s.title)+'</h2>'+
    '<p class="sub">'+nQ+' · '+(s.minutes||'—')+' minutes'+(DATA.kind==='mock'?' (timed)':'')+'</p>'+
    '<p><b>Directions:</b> '+esc(s.instructions||'')+'</p>'+
    (s.audio?'<p>You will hear a lecture. You may take notes while you listen. You will then answer questions about what you heard.</p>':'')+
    (isWriting(s)?'<p>The reading passage will appear on the left of the screen and the writing area on the right, as in the real test.</p>':'')+
    '<div class="btn-row"><button class="btn" type="button" onclick="P.backToStart()">Back</button>'+
    '<button class="btn primary" type="button" onclick="P.beginSection()">Continue</button></div>'+
    '</div></div>';
  startTimerDisplay(false);
}

function renderAudio(){
  var s=sec();
  app().innerHTML = headerHtml()+toolbarHtml(s.skill+' Section','Listening')+
    '<div class="main narrow"><div class="directions">'+
    '<h2>'+esc(s.title)+'</h2>'+
    '<p>Listen to the lecture. You may take notes below while you listen.</p>'+
    '<audio id="lecAudio" controls preload="auto" src="'+esc(s.audio)+'"></audio>'+
    '<p class="pane-label" style="margin-top:16px">Notes</p>'+
    '<textarea class="write-box" style="min-height:150px" id="notesBox" placeholder="Type your notes here…">'+esc(S.notes[s.id]||'')+'</textarea>'+
    '<div class="btn-row"><button class="btn primary" type="button" onclick="P.toQuestions()">Continue to questions</button></div>'+
    '</div></div>';
  var nb=document.getElementById('notesBox');
  nb.addEventListener('input',function(){ S.notes[s.id]=nb.value; saveState(); });
  startTimerDisplay(DATA.kind==='mock');
}

/* ---------------- question screen ---------------- */
function renderQuestion(){
  var s=sec();
  if(isWriting(s)) return renderWriting();
  var qi=S.qIdx, q=s.questions[qi], ans=secAnswers(s.id);
  var left='';
  if(s.passage){
    left='<div class="pane-passage"><p class="pane-label">'+esc(s.skill)+' passage</p><div class="passage-text">'+
      s.passage.map(function(p){return '<p>'+esc(p)+'</p>';}).join('')+'</div></div>';
  }
  var opts=q.options.map(function(o,oi){
    return '<label class="opt'+(ans[qi]===oi?' sel':'')+'"><input type="radio" name="opt" '+(ans[qi]===oi?'checked':'')+
      ' onchange="P.choose('+oi+')"><span class="letter">'+'ABCD'[oi]+'</span><span>'+esc(o)+'</span></label>';
  }).join('');
  var replay='';
  if(s.audio){
    var left1 = DATA.kind==='mock' ? 0 : Math.max(0, 1-(S.replays[s.id]||0));
    replay='<div style="margin-bottom:14px"><button class="tbtn" type="button" '+(left1<=0?'disabled':'')+' onclick="P.replay()">Listen again ('+left1+' replay left)</button>'+
      '<audio id="lecAudio" preload="auto" src="'+esc(s.audio)+'" style="display:none"></audio></div>';
  }
  var body='<div class="main"><div class="'+(s.passage?'split':'')+'">'+left+
    '<div class="'+(s.passage?'pane-question':'')+'" style="'+(s.passage?'':'max-width:820px;margin:0 auto;width:100%')+'">'+
    replay+
    '<p class="q-head">Question '+(qi+1)+' of '+s.questions.length+'</p>'+
    '<p class="q-text">'+esc(q.q)+'</p><div class="opts">'+opts+'</div>'+
    '</div></div></div>';
  var toolbar='<div class="toolbar"><span class="sec-name">'+esc(s.skill)+' Section</span>'+
    '<span class="q-count">Question '+(qi+1)+' of '+s.questions.length+'</span>'+
    '<span class="timer" id="timer"></span>'+
    '<button class="tbtn" type="button" onclick="P.gotoReview()">Review</button>'+
    '<button class="tbtn" type="button" '+(qi===0?'disabled':'')+' onclick="P.prevQ()">Back</button>'+
    '<button class="tbtn primary" type="button" onclick="P.nextQ()">'+(qi===s.questions.length-1?'Review':'Next')+'</button></div>';
  app().innerHTML = headerHtml()+toolbar+body;
  startTimerDisplay(DATA.kind==='mock');
}

function renderWriting(){
  var s=sec(); var w=S.writing[s.id]||{text:'',rate:0};
  var left='<div class="pane-passage"><p class="pane-label">Reading passage</p><div class="passage-text">'+
    (s.passage||[]).map(function(p){return '<p>'+esc(p)+'</p>';}).join('')+'</div>'+
    '<p class="pane-label" style="margin-top:18px">Task</p><p style="line-height:1.6">'+esc(s.task)+'</p>'+
    (s.checklist?'<p class="pane-label" style="margin-top:14px">Checklist</p><ul class="checklist">'+s.checklist.map(function(c){return '<li>'+esc(c)+'</li>';}).join('')+'</ul>':'')+
    '</div>';
  var rates=''; for(var n=1;n<=(s.selfScoreMax||5);n++){ rates+='<button type="button" class="rate-btn'+(w.rate===n?' sel':'')+'" onclick="P.rate('+n+')">'+n+'</button>'; }
  var right='<div class="pane-question"><p class="pane-label">Your response</p>'+
    '<textarea class="write-box" id="writeBox" placeholder="Write your response here…">'+esc(w.text||'')+'</textarea>'+
    '<p class="wordcount"><span id="wc">0</span> words · Target: '+(s.targetWords?s.targetWords[0]+'–'+s.targetWords[1]:'—')+'</p>'+
    '<p style="font-weight:bold;margin:16px 0 2px">Score yourself honestly:</p>'+
    '<p class="small muted" style="margin:0">'+esc(s.selfScoreGuide||'')+'</p>'+
    '<div class="rate-row">'+rates+'</div>'+
    '<p class="small" id="writeMsg" style="color:var(--bad);min-height:1.2em"></p></div>';
  var toolbar='<div class="toolbar"><span class="sec-name">'+esc(s.skill)+' Section</span>'+
    '<span class="q-count">Writing task</span><span class="timer" id="timer"></span>'+
    '<button class="tbtn primary" type="button" onclick="P.submitWriting()">Submit section</button></div>';
  app().innerHTML = headerHtml()+toolbar+'<div class="main"><div class="split">'+left+right+'</div></div>';
  var wb=document.getElementById('writeBox');
  var upd=function(){ var v=wb.value; if(!S.writing[s.id]) S.writing[s.id]={text:'',rate:0}; S.writing[s.id].text=v; saveState();
    document.getElementById('wc').textContent = v.trim()? v.trim().split(/\s+/).length : 0; };
  wb.addEventListener('input',upd); upd();
  startTimerDisplay(DATA.kind==='mock');
}

/* ---------------- review + results ---------------- */
function renderReview(){
  var s=sec();
  if(isWriting(s)){ S.screen='question'; return renderQuestion(); }
  var ans=secAnswers(s.id);
  var rows=s.questions.map(function(q,i){
    var a=ans[i];
    return '<tr class="jump" onclick="P.jumpTo('+i+')"><td>Question '+(i+1)+'</td><td>'+(a===null||a===undefined?'Not answered':'Answered — '+'ABCD'[a])+'</td></tr>';
  }).join('');
  var un=s.questions.filter(function(q,i){return ans[i]===null||ans[i]===undefined;}).length;
  app().innerHTML = headerHtml()+toolbarHtml(s.skill+' Section','Review')+
    '<div class="main narrow"><div class="directions"><h2>Review — '+esc(s.title)+'</h2>'+
    '<p>Click a question to return to it. '+(un?('<b>'+un+' question'+(un>1?'s are':' is')+' still unanswered.</b>'):'All questions are answered.')+'</p>'+
    '<table class="review"><tr><th>Question</th><th>Status</th></tr>'+rows+'</table>'+
    '<div class="btn-row"><button class="btn" type="button" onclick="P.backToQuestions()">Back to questions</button>'+
    '<button class="btn primary" type="button" onclick="P.submitSection()">Submit section</button></div>'+
    '</div></div>';
  startTimerDisplay(DATA.kind==='mock');
}

function renderSectionResult(){
  var s=sec(); var sub=S.submitted[s.id];
  if(!sub){ S.screen='start'; return renderStart(); }
  var detail='';
  if(isWriting(s)){
    var w=S.writing[s.id]||{text:'',rate:0};
    var words=w.text.trim()? w.text.trim().split(/\s+/).length:0;
    detail='<p class="pane-label">Your response ('+words+' words)</p><div class="passage-text" style="border:1px solid var(--line-soft);padding:14px 16px">'+esc(w.text||'(no text)')+'</div>'+
      (s.modelAnswer?'<details class="model-answer"><summary>Model answer</summary><div class="passage-text">'+s.modelAnswer.map(function(p){return '<p>'+esc(p)+'</p>';}).join('')+'</div></details>':'');
  } else {
    var ans=secAnswers(s.id);
    detail=s.questions.map(function(q,i){
      var a=ans[i]; var right=a===q.answer;
      var opts=q.options.map(function(o,oi){
        var cls='opt review-opt'; if(oi===q.answer) cls+=' correct'; else if(oi===a) cls+=' wrong';
        return '<div class="'+cls+'"><span class="letter">'+'ABCD'[oi]+'</span><span>'+esc(o)+'</span></div>';
      }).join('');
      return '<div style="border-top:1px solid var(--line-soft);padding:16px 0"><p class="verdict '+(right?'right':'wrong')+'">Question '+(i+1)+' — '+(right?'Correct':'Incorrect')+'</p>'+
        '<p class="q-text" style="font-size:16px">'+esc(q.q)+'</p><div class="opts">'+opts+'</div>'+
        '<div class="explain"><b>Explanation:</b> '+esc(q.explanation)+'</div></div>';
    }).join('');
    if(s.transcript){ detail+='<details class="model-answer"><summary>Lecture transcript</summary><div class="passage-text"><p>'+esc(s.transcript)+'</p></div></details>'; }
    if(s.passage){ detail='<div style="margin-bottom:6px"><p class="pane-label">Passage</p><div class="passage-text">'+s.passage.map(function(p){return '<p>'+esc(p)+'</p>';}).join('')+'</div></div>'+detail; }
  }
  var last = S.sectionIdx>=DATA.sections.length-1;
  var nextBtn;
  if(DATA.kind==='mock' && !last){ nextBtn='<button class="btn primary" type="button" onclick="P.startSection('+(S.sectionIdx+1)+')">Continue to next section</button>'; }
  else if(DATA.kind==='mock' && last){ nextBtn='<button class="btn primary" type="button" onclick="P.viewSummary()">View test summary</button>'; }
  else { nextBtn='<button class="btn primary" type="button" onclick="P.backToStart()">Return to test menu</button>'; }
  app().innerHTML = headerHtml()+toolbarHtml(s.skill+' Section','Results')+
    '<div class="main narrow"><div class="directions"><h2>'+esc(s.title)+'</h2>'+
    '<p class="score-line">Score: '+sub.score+' / '+sub.total+' · '+sub.pct+'%</p>'+
    '<p class="small muted">Recorded '+esc(sub.dateLabel)+'.</p>'+detail+
    '<div class="btn-row">'+nextBtn+'</div></div></div>';
}

function renderSummary(){
  var rows=DATA.sections.map(function(s){
    var sub=S.submitted[s.id];
    return '<tr><td>'+esc(s.title)+'</td><td>'+(sub? sub.score+' / '+sub.total+' · '+sub.pct+'%' : 'Not taken')+'</td></tr>';
  }).join('');
  var done=DATA.sections.filter(function(s){return S.submitted[s.id];});
  var avg=done.length? Math.round(done.reduce(function(a,s){return a+S.submitted[s.id].pct;},0)/done.length):0;
  app().innerHTML = headerHtml()+
    '<div class="main narrow"><div class="directions"><h2>'+esc(DATA.title)+' — Summary</h2>'+
    '<table class="sections"><tr><th>Section</th><th>Score</th></tr>'+rows+'</table>'+
    (done.length?'<p class="score-line">Average across finished sections: '+avg+'%</p>':'')+
    '<div class="btn-row"><button class="btn" type="button" onclick="P.backToStart()">Back to test menu</button>'+
    '<button class="btn" type="button" onclick="P.resetAll()">Start a new attempt</button></div>'+
    '</div></div>';
}

/* ---------------- timer ---------------- */
function stopTimer(){ if(timerInt){ clearInterval(timerInt); timerInt=null; } }
function startTimerDisplay(isCountdown){
  stopTimer();
  var s=sec(); if(!s) return;
  if(!S.sectionStart[s.id]){ S.sectionStart[s.id]=Date.now(); saveState(); }
  if(isCountdown && !S.deadline[s.id]){ S.deadline[s.id]=S.sectionStart[s.id]+(s.minutes||0)*60000; saveState(); }
  var tick=function(){
    var el=document.getElementById('timer'); if(!el){ stopTimer(); return; }
    if(isCountdown){
      var left=(S.deadline[s.id]-Date.now())/1000;
      el.textContent='Time remaining: '+fmtClock(left);
      el.className='timer'+(left<60?' low':'');
      if(left<=0){ stopTimer(); P.submitSection(true); }
    } else {
      el.textContent='Time: '+fmtClock((Date.now()-S.sectionStart[s.id])/1000)+' (suggested '+(s.minutes||'—')+' min)';
      el.className='timer';
    }
  };
  tick(); timerInt=setInterval(tick,1000);
}

/* ---------------- actions ---------------- */
window.P={
  startSection:function(i){
    S.sectionIdx=i; S.qIdx=0;
    var s=sec();
    if(S.submitted[s.id] && DATA.kind==='mini'){ // retake: clear this section
      delete S.submitted[s.id]; S.answers[s.id]=[]; delete S.sectionStart[s.id]; delete S.deadline[s.id];
      if(s.id in S.writing) S.writing[s.id]={text:'',rate:0};
    }
    S.screen='directions'; saveState(); render();
  },
  beginSection:function(){
    var s=sec();
    if(!S.sectionStart[s.id]){ S.sectionStart[s.id]=Date.now(); }
    if(DATA.kind==='mock' && !S.deadline[s.id]){ S.deadline[s.id]=S.sectionStart[s.id]+(s.minutes||0)*60000; }
    S.qIdx=0; S.screen = s.audio ? 'audio' : 'question'; saveState(); render();
  },
  backToStart:function(){ S.screen='start'; saveState(); render(); },
  toQuestions:function(){ S.screen='question'; S.qIdx=0; saveState(); render(); },
  choose:function(oi){ var s=sec(); secAnswers(s.id)[S.qIdx]=oi; saveState(); renderQuestion(); },
  replay:function(){
    var s=sec(); S.replays[s.id]=(S.replays[s.id]||0)+1; saveState();
    var a=document.getElementById('lecAudio'); if(a){ a.currentTime=0; a.play(); }
    renderQuestion();
  },
  nextQ:function(){ var s=sec(); if(S.qIdx>=s.questions.length-1){ S.screen='review'; } else { S.qIdx++; } saveState(); render(); },
  prevQ:function(){ if(S.qIdx>0){ S.qIdx--; } saveState(); render(); },
  gotoReview:function(){ S.screen='review'; saveState(); render(); },
  backToQuestions:function(){ S.screen='question'; saveState(); render(); },
  jumpTo:function(i){ S.qIdx=i; S.screen='question'; saveState(); render(); },
  rate:function(n){ var s=sec(); if(!S.writing[s.id]) S.writing[s.id]={text:'',rate:0}; S.writing[s.id].rate=n; saveState(); renderWriting(); },
  submitWriting:function(){
    var s=sec(); var w=S.writing[s.id]||{text:'',rate:0};
    if(!w.rate){ var m=document.getElementById('writeMsg'); if(m) m.textContent='Please choose a self-score (1–'+(s.selfScoreMax||5)+') before submitting.'; return; }
    finishSection(w.rate, s.selfScoreMax||5);
  },
  submitSection:function(auto){
    var s=sec(); if(isWriting(s)){ return P.submitWriting(); }
    var ans=secAnswers(s.id); var score=0;
    s.questions.forEach(function(q,i){ if(ans[i]===q.answer) score++; });
    finishSection(score, s.questions.length);
  },
  viewSummary:function(){ S.screen='summary'; saveState(); render(); },
  resetAll:function(){ clearState(); render(); }
};
function finishSection(score,total){
  var s=sec(); var now=new Date();
  var pct=Math.round(score/total*100);
  var rec={test:s.title, dateISO:now.toISOString(), dateLabel:fmtDate(now), score:score, total:total, pct:pct};
  S.submitted[s.id]={score:score,total:total,pct:pct,dateLabel:rec.dateLabel};
  if(DATA.sections.every(function(x){return S.submitted[x.id];})) S.attemptComplete=true;
  S.screen='sectionResult'; saveState();
  reportEvent({type:'score', set:DATA.set, test:s.title, date:rec.dateISO, score:score, total:total, percentage:pct});
  pushHistory(rec);
  render();
}

/* ---------------- boot ---------------- */
fetch(window.TEST_DATA_URL).then(function(r){ return r.json(); }).then(function(d){
  DATA=d; S=loadState();
  reportEvent({type:'visit', set:DATA.set, date:new Date().toISOString()});
  render();
}).catch(function(){
  document.getElementById('app').innerHTML='<div class="main narrow"><p>Could not load the test data. Please reload the page.</p></div>';
});
})();
