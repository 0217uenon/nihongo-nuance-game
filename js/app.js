(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const app = $("#app");
  const dialog = $("#settings-dialog");
  const questions = window.KOTOBA_QUESTIONS;
  const levels = window.KOTOBA_LEVELS;
  const knowledge = window.KOTOBA_KNOWLEDGE || {};
  const STORAGE = "kotoba-no-mori-v1";
  const NEURAL_PLAYBACK_RATE = 1.2;
  const defaultState = {
    screen:"home", level:null, index:0, score:0, answered:false, attempts:0,
    missed:[], learned:[], quiz:[], responses:{}, reviewMode:false,
    settings:{speech:true,ruby:true,motion:false,rate:.85,voiceURI:""},
    progress:{beginner:0,intermediate:0,advanced:0}
  };
  let state = load();

  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE)||"{}");
      return {...defaultState,...saved,screen:"home",quiz:[],responses:{},missed:[],learned:[],settings:{...defaultState.settings,...saved.settings},progress:{...defaultState.progress,...saved.progress}};
    }catch{return structuredClone(defaultState)}
  }
  function save(){localStorage.setItem(STORAGE,JSON.stringify({settings:state.settings,progress:state.progress}))}
  function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function shuffle(list){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  let japaneseVoices = [];
  let activeUtterances = [];
  let currentAudio = null;
  let currentClip = "";
  let repeatTimer = null;
  let announceTimer = null;
  function setSpeaking(active){
    const speechButton=$('[data-action="repeat"]');
    speechButton?.classList.toggle("speaking",active);
    speechButton?.setAttribute("aria-label",active?"読み上げを停止する":"画面の文章を読み上げる");
  }
  function naturalScore(voice){
    const name=`${voice.name} ${voice.voiceURI}`.toLowerCase();
    let score=0;
    if(/^ja(-|_)/i.test(voice.lang))score+=1000;
    if(/natural|neural|premium|enhanced/.test(name))score+=500;
    if(/nanami|mayu|shiori|ayumi/.test(name))score+=180;
    if(/google|microsoft|apple/.test(name))score+=80;
    if(voice.localService)score+=10;
    return score;
  }
  function refreshVoices(){
    if(!("speechSynthesis" in window))return;
    japaneseVoices=speechSynthesis.getVoices()
      .filter(v=>/^ja(-|_)/i.test(v.lang))
      .sort((a,b)=>naturalScore(b)-naturalScore(a));
    const select=$("#setting-voice");
    if(!select)return;
    const previous=state.settings.voiceURI;
    select.innerHTML=japaneseVoices.length
      ? japaneseVoices.map(v=>`<option value="${esc(v.voiceURI)}">${naturalScore(v)>=1500?"✨ 自然｜":""}${esc(v.name)}</option>`).join("")
      : `<option value="">端末標準の日本語音声</option>`;
    const best=japaneseVoices.find(v=>v.voiceURI===previous)||japaneseVoices[0];
    if(best){select.value=best.voiceURI;state.settings.voiceURI=best.voiceURI}
    const help=$("#voice-help");
    if(help){
      const natural=best&&naturalScore(best)>=1500;
      help.classList.toggle("natural",!!natural);
      help.textContent=best
        ? `${natural?"✨ 高品質な自然音声":"端末内の日本語音声"}「${best.name}」を使用します。`
        : "日本語音声が見つかりません。端末の音声設定をご確認ください。";
    }
  }
  function normalizeSpeech(text){
    return String(text)
      .replace(/AI/g,"エーアイ")
      .replace(/SNS/g,"エスエヌエス")
      .replace(/Web Speech API/gi,"ウェブ・スピーチ・エーピーアイ")
      .replace(/10問/g,"じゅうもん")
      .replace(/[「」]/g,"")
      .replace(/\s+/g," ")
      .trim();
  }
  function speak(text){
    if(!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    activeUtterances=[];
    const clean=normalizeSpeech(text.replace(/[①②③④]/g,""));
    const parts=clean.match(/[^。！？]+[。！？]?/g)||[clean];
    const voice=japaneseVoices.find(v=>v.voiceURI===state.settings.voiceURI)||japaneseVoices[0];
    setSpeaking(true);
    parts.forEach((part,index)=>{
      const u=new SpeechSynthesisUtterance(part.trim());
      u.lang="ja-JP";u.rate=Math.min(1.25,state.settings.rate*NEURAL_PLAYBACK_RATE);u.pitch=1.0;u.volume=1;
      if(voice)u.voice=voice;
      activeUtterances.push(u);
      if(index===parts.length-1){
        u.onend=u.onerror=()=>{
          activeUtterances=[];
          setSpeaking(false);
        };
      }
      speechSynthesis.speak(u);
    });
  }
  function stopSpeech(){
    if(announceTimer){
      clearTimeout(announceTimer);
      announceTimer=null;
    }
    if(repeatTimer){
      clearTimeout(repeatTimer);
      repeatTimer=null;
    }
    if(currentAudio){
      currentAudio.pause();
      currentAudio.currentTime=0;
      currentAudio=null;
      currentClip="";
    }
    window.speechSynthesis?.cancel();
    activeUtterances=[];
    setSpeaking(false);
  }
  function playNarration(clip,fallbackText,repeatCount=1){
    stopSpeech();
    currentClip=clip;
    const audio=new Audio(clip);
    currentAudio=audio;
    let remaining=Math.max(1,repeatCount);
    audio.preload="auto";
    audio.playbackRate=NEURAL_PLAYBACK_RATE;
    audio.preservesPitch=true;
    audio.onplay=()=>setSpeaking(true);
    audio.onended=()=>{
      remaining--;
      if(remaining>0){
        setSpeaking(true);
        repeatTimer=setTimeout(()=>{
          repeatTimer=null;
          if(currentAudio!==audio)return;
          audio.currentTime=0;
          audio.play().catch(()=>speak(`${fallbackText}。もう一度読みます。${fallbackText}`));
        },650);
        return;
      }
      currentAudio=null;currentClip="";setSpeaking(false);
    };
    audio.onerror=()=>{
      currentAudio=null;
      currentClip="";
      speak(fallbackText);
    };
    audio.play().catch(()=>speak(repeatCount>1?`${fallbackText}。もう一度読みます。${fallbackText}`:fallbackText));
  }
  function questionSpeech(q){
    const choices=q.choices.map((choice,index)=>`${index+1}番。${choice}${/[。！？!?]$/.test(choice)?"":"。"}`).join(" ");
    const scene=/[。！？!?]$/.test(q.scene)?q.scene:`${q.scene}。`;
    const prompt=/[。！？!?]$/.test(q.prompt)?q.prompt:`${q.prompt}。`;
    return `${scene}もう一度、読みます。${scene}では、問題です。${prompt}選択肢です。${choices}`;
  }
  function answerSpeech(q,response){
    const k=knowledge[q.baseId||q.id];
    const intro=response.correct
      ? `正解！ ぴったりだよ。正しい答えは、${q.choices[q.answer]}。`
      : `今回は不正解。でも、ここで覚えよう。選んだ答えは、${q.choices[response.selected]}。正しい答えは、${q.choices[q.answer]}。`;
    if(!k)return `${intro}${q.explanation}`;
    return `${intro}${q.explanation}もっと知ろう。今回のポイントは、${k.focus}。似ている言葉には、${k.similar.join("、")}があります。反対に近い言葉には、${k.opposite.join("、")}があります。${k.situation}最後に、考えてみよう。${k.curiosity}`;
  }
  function knowledgeCard(q){
    const k=knowledge[q.baseId||q.id];
    if(!k)return "";
    return `<section class="knowledge-card" aria-label="もっと知ろう">
      <div class="knowledge-title"><span>🌳</span><div><small>ことばの枝を のばそう</small><h4>もっと知ろう！ ${esc(k.focus)}</h4></div></div>
      <div class="word-family">
        <div><strong>🤝 似ている言葉</strong><p>${k.similar.map(x=>`<span>${esc(x)}</span>`).join("")}</p></div>
        <div><strong>↔️ 反対に近い言葉</strong><p>${k.opposite.map(x=>`<span>${esc(x)}</span>`).join("")}</p></div>
      </div>
      <div class="situation-note"><strong>🎭 場面で変わるよ</strong><p>${esc(k.situation)}</p></div>
      <div class="curiosity"><strong>🔎 考えてみよう</strong><p>${esc(k.curiosity)}</p></div>
    </section>`;
  }
  function applySettings(){
    document.body.classList.toggle("reduce-motion",state.settings.motion);
    document.body.classList.toggle("hide-ruby",!state.settings.ruby);
    $("#setting-speech").checked=state.settings.speech;
    $("#setting-ruby").checked=state.settings.ruby;
    $("#setting-motion").checked=state.settings.motion;
    $("#setting-rate").value=state.settings.rate;
    $("#rate-label").textContent=state.settings.rate<.8?"ゆっくり":state.settings.rate<.94?"聞きやすい":state.settings.rate<1.04?"ふつう":"速い";
    refreshVoices();
  }
  function render(){
    applySettings();
    if(state.screen==="home") renderHome();
    else if(state.screen==="levels") renderLevels();
    else if(state.screen==="quiz") renderQuiz();
    else if(state.screen==="result") renderResult();
    else if(state.screen==="parents") renderParents();
    $('[data-action="repeat"]').hidden=state.screen!=="quiz";
    app.focus({preventScroll:true});
  }
  function renderHome(){
    app.innerHTML=`<section class="screen hero">
      <div class="hero-copy">
        <p class="eyebrow">ことばの ちがいを 見つけよう</p>
        <h1>ことばの森へ<br><em>たんけん</em>に行こう！</h1>
        <p class="lead">生きものたちと、似ていることばの「ちょっとした違い」を楽しく学ぶ10問クイズ。</p>
        <div class="hero-actions">
          <button class="primary-button" data-action="levels">🌱 たんけんを はじめる</button>
          <button class="secondary-button" data-action="parents">おうちの方・先生へ</button>
        </div>
      </div>
      <div class="mascot-stage" aria-label="案内役のカワウソ、ニュアン">
        <span class="leaf one">🍃</span><div class="mascot">🦦</div><span class="leaf two">🍂</span>
        <div class="mascot-bubble">「ぴったり！」を<br>いっしょに探そう</div>
      </div>
    </section>`;
  }
  function renderLevels(){
    app.innerHTML=`<section class="screen">
      <div class="section-head"><p class="eyebrow">どこからでも だいじょうぶ</p><h1><ruby>難<rt>むずか</rt></ruby>しさを えらぼう</h1><p><ruby>年齢<rt>ねんれい</rt></ruby>はめやす。<ruby>好<rt>す</rt></ruby>きな森から<ruby>始<rt>はじ</rt></ruby>めてね。</p></div>
      <div class="level-grid">${Object.entries(levels).map(([key,l])=>`
        <button class="level-card" style="--level-color:${l.color}" data-level="${key}">
          ${state.progress[key]?`<span class="saved-badge">⭐ 最高 ${state.progress[key]}問正解</span>`:""}
          <span class="level-icon">${l.icon}</span><span class="level-kana">${l.kana}</span>
          <h2>${l.name}</h2><span class="level-guide">${l.guide}</span><p>${l.description}</p>
        </button>`).join("")}</div>
      <div class="back-row"><button class="secondary-button" data-action="home">← もどる</button></div>
    </section>`;
  }
  function start(level, reviewIds=null){
    state.level=level;state.index=0;state.score=0;state.answered=false;state.attempts=0;state.missed=[];state.learned=[];state.responses={};
    state.reviewMode=Array.isArray(reviewIds);
    state.quiz=reviewIds?questions[level].filter(q=>reviewIds.includes(q.id)):shuffle(questions[level]).slice(0,10);
    state.screen="quiz";render();announceQuestion();
  }
  function makePracticeSet(level,setNumber){
    const iconCycle=["🐰","🦦","🦉","🦊","🐿️","🐶","🐻","🦎","🐢","🐦"];
    return shuffle(questions[level]).map((base,index)=>({
      ...base,
      id:setNumber===1?base.id:`${base.id}-set${setNumber}`,
      baseId:base.id,
      assetId:base.id,
      icon:setNumber===1?base.icon:iconCycle[(index+setNumber)%iconCycle.length]
    }));
  }
  function addNextSet(){
    if(state.quiz.length>=100)return;
    const setNumber=Math.floor(state.quiz.length/10)+1;
    state.quiz.push(...makePracticeSet(state.level,setNumber));
    state.index=state.quiz.length-10;
    state.screen="quiz";render();announceQuestion();
  }
  function batchBounds(){
    const start=Math.floor(state.index/10)*10;
    return {start,end:Math.min(start+10,state.quiz.length)};
  }
  function answeredCount(){return Object.keys(state.responses).length}
  function scoreCount(){return Object.values(state.responses).filter(r=>r.correct).length}
  function renderQuiz(){
    const q=state.quiz[state.index],l=levels[state.level];
    if(!q){finish();return}
    const response=state.responses[q.id];
    const bounds=batchBounds();
    const batchQuestions=state.quiz.slice(bounds.start,bounds.end);
    app.innerHTML=`<section class="screen quiz-shell" style="--level-color:${l.color}">
      <div class="progress-head"><span class="count-pill">${l.icon} ${l.name}</span><div class="progress-track" aria-label="${state.quiz.length}問中${answeredCount()}問回答"><div class="progress-fill" style="width:${(answeredCount()/state.quiz.length)*100}%"></div></div><span class="count-pill">回答 ${answeredCount()} / ${state.quiz.length}</span></div>
      <nav class="question-nav" aria-label="問題を選ぶ">
        ${bounds.start>0?`<button class="batch-button" data-question="${bounds.start-1}">← 前の10問</button>`:""}
        <div class="question-buttons">${batchQuestions.map((item,offset)=>{
          const absolute=bounds.start+offset,answer=state.responses[item.id];
          const status=answer?(answer.correct?"is-correct":"is-wrong"):"";
          return `<button class="question-button ${status} ${absolute===state.index?"is-current":""}" data-question="${absolute}" aria-label="問題${absolute+1}${answer?(answer.correct?" 正解":" 不正解"):" 未回答"}">${absolute+1}</button>`;
        }).join("")}</div>
        ${bounds.end<state.quiz.length?`<button class="batch-button" data-question="${bounds.end}">次の10問 →</button>`:""}
      </nav>
      <article class="quiz-card">
        <div class="question-top"><div class="scene-icon" aria-hidden="true">${q.icon}</div><div><span class="theme-tag">${esc(q.theme)}</span><p class="scene">${esc(q.scene)}</p></div></div>
        <h1 class="prompt">${esc(q.prompt)}</h1>
        ${response?"":`<div class="restart-row"><button class="restart-button" data-action="restart-question">↺ この問題を最初から</button></div>`}
        <div class="choices">${q.choices.map((c,i)=>{
          const cls=response?(i===q.answer?"correct":i===response.selected?"wrong":"dim"):"";
          return `<button class="choice ${cls}" data-choice="${i}" ${response?"disabled":""}><span class="choice-index">${i+1}</span><span>${esc(c)}</span></button>`;
        }).join("")}</div>
        ${response?"":`<button class="hint-button" data-action="hint">💡 ヒントを見る</button>`}
        <div id="feedback-slot"></div>
      </article>
    </section>`;
    if(response)showFeedback(response.correct,q,response);
  }
  function announceQuestion(){
    if(!state.settings.speech)return;
    const q=state.quiz[state.index];
    if(state.responses[q.id])return;
    const audioId=q.assetId||q.baseId||q.id;
    announceTimer=setTimeout(()=>{
      announceTimer=null;
      if(state.responses[q.id])return;
      playNarration(`assets/audio/questions/${audioId}-question.mp3`,questionSpeech(q));
    },250);
  }
  function choose(index){
    const q=state.quiz[state.index];
    if(state.responses[q.id])return;
    stopSpeech();
    const correct=index===q.answer;
    state.responses[q.id]={selected:index,correct};
    state.score=scoreCount();
    if(!correct&&!state.missed.includes(q.id))state.missed.push(q.id);
    if(!state.learned.includes(q.word))state.learned.push(q.word);
    render();
    if(state.settings.speech){
      const audioId=q.assetId||q.baseId||q.id;
      const clip=correct
        ? `assets/audio/questions/${audioId}-answer.mp3`
        : `assets/audio/questions/${audioId}-wrong-${index}.mp3`;
      playNarration(clip,answerSpeech(q,state.responses[q.id]));
    }
  }
  function showFeedback(correct,q,response){
    const slot=$("#feedback-slot");
    if(correct){
      slot.innerHTML=`<div class="feedback" role="status"><h3>🌟 正解！ ぴったり！</h3><p><strong>正しい答え：${esc(q.choices[q.answer])}</strong></p><p>${esc(q.explanation)}</p>${q.contrast?`<div class="contrast">${q.contrast.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`:""}</div>${knowledgeCard(q)}${answerActions()}`;
    }else{
      slot.innerHTML=`<div class="feedback try wrong-answer" role="alert"><h3>🍀 不正解。でも、ここで覚えよう！</h3><p>選んだ答え：${esc(q.choices[response.selected])}</p><p><strong>正しい答え：${esc(q.choices[q.answer])}</strong></p><p>${esc(q.explanation)}</p>${q.contrast?`<div class="contrast">${q.contrast.map(x=>`<span>${esc(x)}</span>`).join("")}</div>`:""}</div>${knowledgeCard(q)}${answerActions()}`;
    }
  }
  function answerActions(){
    const bounds=batchBounds();
    const batchComplete=state.quiz.slice(bounds.start,bounds.end).every(q=>state.responses[q.id]);
    const isLastInBatch=state.index===bounds.end-1;
    if(batchComplete&&isLastInBatch){
      return `<div class="next-row"><button class="primary-button" data-action="finish-set">この10問のけっかを見る</button></div>`;
    }
    return `<div class="next-row"><button class="primary-button" data-action="next">つぎの問題へ →</button></div>`;
  }
  function next(){
    stopSpeech();
    const bounds=batchBounds();
    let target=-1;
    for(let i=state.index+1;i<bounds.end;i++){
      if(!state.responses[state.quiz[i].id]){target=i;break}
    }
    if(target<0){
      for(let i=bounds.start;i<bounds.end;i++){
        if(!state.responses[state.quiz[i].id]){target=i;break}
      }
    }
    if(target<0){finish();return}
    state.index=target;render();announceQuestion();
  }
  function finish(){
    stopSpeech();
    state.score=scoreCount();
    state.progress[state.level]=Math.max(state.progress[state.level]||0,state.score);save();state.screen="result";render();
  }
  function renderResult(){
    const l=levels[state.level],count=state.quiz.length,pct=Math.round(state.score/count*100);
    const message=pct===100?"ことば博士！ ぜんぶぴったり！":pct>=70?"すごい！ ことばの葉がいっぱい！":"最後までたんけんできたね！";
    app.innerHTML=`<section class="screen result-card" style="--level-color:${l.color};--score:${pct}%">
      <div class="result-mascot">${pct===100?"🦉":"🦦"}</div><p class="eyebrow">${l.name} たんけんクリア</p><h1>${message}</h1>
      <div class="score-ring" aria-label="${count}問中${state.score}問を一回で正解"><strong>${state.score}/${count}</strong></div>
      <p>最初のちょうせんで「ぴったり！」を選べた数だよ。まちがえても、学んだら大成功！</p>
      <div class="word-leaves" aria-label="今回出会ったことば">${[...new Set(state.learned)].map(w=>`<span>🍃 ${esc(w)}</span>`).join("")}</div>
      <div class="result-actions">
        <button class="secondary-button" data-action="back-questions">📚 解答した問題にもどる</button>
        ${count<100?`<button class="primary-button" data-action="add-batch">➕ 次の10問を追加</button>`:`<span class="max-badge">🏆 100問達成！</span>`}
        <button class="secondary-button" data-action="retry">最初からあそぶ</button>
        <button class="secondary-button" data-action="levels">別の森へ</button>
      </div>
    </section>`;
  }
  function renderParents(){
    app.innerHTML=`<section class="screen parent-note">
      <p class="eyebrow">おうちの方・先生へ</p><h1>正解より、「なぜ？」を楽しむゲームです</h1>
      <p>本アプリは、同意語・反意語・感情・程度・丁寧さ・確かさなど、日本語の微妙な違いを場面と一緒に学ぶ教材です。</p>
      <h2>安心して使うために</h2><ul><li>名前や年齢などの個人情報は入力・送信しません。</li><li>広告、課金、チャット、外部SNSへの共有はありません。</li><li>成績は他の人と比べず、この端末に最高記録だけを保存します。</li><li>制限時間はありません。誤答後もヒントを見て再挑戦できます。</li></ul>
      <h2>声かけのヒント</h2><p>「どうしてそう思った？」「こっちの言葉が合う場面は？」と聞くと、答えを当てるだけでなく、自分の意図を説明する力につながります。</p>
      <h2>AI時代のことば</h2><p>上級では、対象・動作・雰囲気・用途を具体化する問題も扱います。AIだけの技術ではなく、相手へ正確に意図を伝える普遍的な母国語能力として設計しています。</p>
      <div class="back-row"><button class="primary-button" data-action="home">タイトルへもどる</button></div>
    </section>`;
  }
  document.addEventListener("click",e=>{
    const level=e.target.closest("[data-level]")?.dataset.level;if(level){start(level);return}
    const question=e.target.closest("[data-question]")?.dataset.question;
    if(question!==undefined){
      stopSpeech();state.index=Number(question);state.screen="quiz";render();announceQuestion();return;
    }
    const choice=e.target.closest("[data-choice]");if(choice){choose(Number(choice.dataset.choice));return}
    const action=e.target.closest("[data-action]")?.dataset.action;if(!action)return;
    if(action==="home"){stopSpeech();state.screen="home";render()}
    if(action==="levels"){stopSpeech();state.screen="levels";render()}
    if(action==="settings"){applySettings();dialog.showModal()}
    if(action==="repeat"){
      if(currentAudio||activeUtterances.length)stopSpeech();
      else if(state.screen==="quiz"){
        const q=state.quiz[state.index];
        const audioId=q.assetId||q.baseId||q.id;
        playNarration(`assets/audio/questions/${audioId}-question.mp3`,questionSpeech(q));
      }
    }
    if(action==="parents"){state.screen="parents";render()}
    if(action==="hint"){
      const q=state.quiz[state.index];
      stopSpeech();
      $("#feedback-slot").innerHTML=`<div class="feedback try" role="status"><h3>💡 ヒント</h3><p>${esc(q.hint)}</p></div>`;
    }
    if(action==="restart-question"){
      stopSpeech();
      render();
      announceQuestion();
    }
    if(action==="next")next();
    if(action==="finish-set")finish();
    if(action==="add-batch")addNextSet();
    if(action==="back-questions"){state.screen="quiz";state.index=Math.max(0,state.quiz.length-1);render()}
    if(action==="retry")start(state.level);
  });
  ["speech","ruby","motion"].forEach(key=>{
    $(`#setting-${key}`).addEventListener("change",e=>{state.settings[key]=e.target.checked;applySettings();save()});
  });
  $("#setting-rate").addEventListener("input",e=>{state.settings.rate=Number(e.target.value);applySettings();save()});
  $("#setting-voice").addEventListener("change",e=>{state.settings.voiceURI=e.target.value;save();refreshVoices()});
  dialog.addEventListener("close",()=>{save();render()});
  window.addEventListener("keydown",e=>{
    const q=state.quiz[state.index];
    if(state.screen==="quiz"&&q&&!state.responses[q.id]&&["1","2","3","4"].includes(e.key)){
      const b=$(`[data-choice="${Number(e.key)-1}"]`);if(b&&!b.disabled)b.click();
    }
  });
  if("speechSynthesis" in window){
    speechSynthesis.addEventListener?.("voiceschanged",refreshVoices);
    setTimeout(refreshVoices,100);
    setTimeout(refreshVoices,800);
  }
  render();
})();
