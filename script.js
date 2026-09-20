// Tug of War Math Arena — Firebase multiplayer client
// Replace firebaseConfig below with the config from your Firebase Web app.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCqqLqYciSjUJQFOy29_59HARVFYY8Uk9k",
  authDomain: "tug-of-war-math-d559a.firebaseapp.com",
  projectId: "tug-of-war-math-d559a",
  storageBucket: "tug-of-war-math-d559a.firebasestorage.app",
  messagingSenderId: "237529089330",
  appId: "1:237529089330:web:d9e220574d57a59bd8432b",
  measurementId: "G-R997WRYN47"
};

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
let uid=null, roomId=null, unsub=null, isHost=false, state=null, timerInt=null;

const $=id=>document.getElementById(id);
const show=(id,on)=>$(id).classList.toggle("hidden",!on);
const safeName=n=>(n||"Joueur").trim().slice(0,18)||"Joueur";

function question(){
  const t=Math.floor(Math.random()*4)+1; let a,b,ans,text;
  if(t===1){a=r(2,50);b=r(2,50);ans=a+b;text=`${a} + ${b}`;}
  else if(t===2){a=r(10,80);b=r(1,a);ans=a-b;text=`${a} − ${b}`;}
  else if(t===3){a=r(2,12);b=r(2,12);ans=a*b;text=`${a} × ${b}`;}
  else{b=r(2,12);ans=r(2,12);a=b*ans;text=`${a} ÷ ${b}`;}
  const opts=new Set([ans]); while(opts.size<4) opts.add(Math.max(0,ans+r(-10,10)));
  return {text:text+" = ?",answer:ans,options:[...opts].sort(()=>Math.random()-.5)};
}
function r(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function code(){return Math.random().toString(36).slice(2,8).toUpperCase()}
function roomRef(){return doc(db,"rooms",roomId)}

async function authIn(){try{const x=await signInAnonymously(auth);uid=x.user.uid}catch(e){$("lobbyMsg").textContent="Firebase Auth n'est pas activée.";throw e}}

async function create(){
  await authIn(); isHost=true; roomId=code(); const name=safeName($("hostName").value);
  const q=question();
  state={status:"waiting",host:uid,players:{[uid]:{name,side:1,score:0}},q,position:0,round:1,deadline:null};
  await setDoc(roomRef(),{...state,createdAt:serverTimestamp()}); listen();
  $("roomCode").textContent=roomId; show("created",true); $("lobbyMsg").textContent="";
}
async function join(){
  await authIn(); isHost=false; roomId=$("joinCode").value.trim().toUpperCase();
  if(roomId.length!==6){$("lobbyMsg").textContent="Code invalide.";return}
  listen(true);
}
function listen(joining=false){
  if(unsub)unsub();
  unsub=onSnapshot(roomRef(),async snap=>{
    if(!snap.exists()){ $("lobbyMsg").textContent="Partie introuvable."; return}
    state=snap.data();
    if(joining && state.status==="waiting" && !state.players[uid]){
      const name=safeName($("guestName").value);
      const players={...state.players,[uid]:{name,side:2,score:0}};
      await updateDoc(roomRef(),{players,status:"ready"});
      return;
    }
    render();
  },err=>{$("lobbyMsg").textContent="Connexion à la partie impossible.";console.error(err)});
}
function render(){
  if(!state)return;
  if(state.status==="waiting"||state.status==="ready"){
    show("lobby",true); show("game",false); show("result",false);
    if(state.status==="ready"){ $("hostWait").textContent="Ton ami est connecté !"; show("startBtn",isHost)}
    return;
  }
  if(state.status==="playing"){show("lobby",false);show("result",false);show("game",true);drawGame()}
  if(state.status==="finished"){show("lobby",false);show("game",false);show("result",true);drawResult()}
}
function drawGame(){
  const p=Object.values(state.players); const p1=p.find(x=>x.side===1),p2=p.find(x=>x.side===2);
  $("gameRoom").textContent=roomId;$("p1Name").textContent=p1?.name||"Joueur 1";$("p2Name").textContent=p2?.name||"Joueur 2";
  $("p1Score").textContent=p1?.score||0;$("p2Score").textContent=p2?.score||0;
  $("roundNo").textContent=state.round||1;$("question").textContent=state.q?.text||"—";
  $("turnText").textContent=(state.q?.owner===uid)?"À TOI":"Ton adversaire joue…";
  $("answers").innerHTML="";
  (state.q?.options||[]).forEach(v=>{const b=document.createElement("button");b.type="button";b.textContent=v;b.addEventListener("click",()=>answer(v));$("answers").appendChild(b)});
  $("knot").style.left=`${Math.max(8,Math.min(92,50+(state.position||0)*8))}%`;
  startTimer();
}
function startTimer(){
  clearInterval(timerInt); if(!state?.deadline){$("timer").textContent="∞";return}
  const tick=()=>{const s=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));$("timer").textContent=s;if(s<=0){clearInterval(timerInt);answer(null,true)}};tick();timerInt=setInterval(tick,250);
}
async function answer(v,timeout=false){
  if(!state||state.status!=="playing"||state.q.owner!==uid)return;
  const correct=!timeout && Number(v)===Number(state.q.answer);
  const players={...state.players}; const me={...players[uid]};
  if(correct){me.score=(me.score||0)+1; state.position+=(me.side===1?-1:1); $("feedback").textContent="Bonne réponse ! ⚡"; $("feedback").style.color="var(--green)"}
  else {$("feedback").textContent=timeout?"Temps écoulé !":"Raté !";$("feedback").style.color="var(--red)"}
  players[uid]=me;
  const scores=Object.values(players).map(x=>x.score||0);
  if(Math.max(...scores)>=5){await updateDoc(roomRef(),{players,position:state.position,status:"finished",winner:me.score>=5?uid:null});return}
  const q=question(); q.owner=uid===Object.values(players).find(x=>x.side===1)?.uid?uid:Object.keys(players).find(k=>k!==uid); // next owner
  // Alternate question ownership so both players get turns.
  q.owner=Object.keys(players).find(k=>k!==uid)||uid;
  await updateDoc(roomRef(),{players,position:state.position,q:{...q},round:(state.round||1)+1,deadline:Date.now()+10000});
}
async function start(){if(!isHost||!state?.players||Object.keys(state.players).length<2)return;const q=question();q.owner=Object.keys(state.players)[0];await updateDoc(roomRef(),{status:"playing",q,deadline:Date.now()+10000,round:1})}
function drawResult(){const p=Object.entries(state.players),w=state.winner?state.players[state.winner]:p.find(([,x])=>x.score>=5)?.[1];$("resultTitle").textContent=w?`${w.name} gagne !`:"Match terminé";$("resultText").textContent=`${p.map(([,x])=>`${x.name}: ${x.score}`).join(" • ")}`}

$("createBtn").addEventListener("click",()=>create().catch(e=>{$("lobbyMsg").textContent="Impossible de créer la partie."}));
$("joinBtn").addEventListener("click",()=>join().catch(e=>{$("lobbyMsg").textContent="Impossible de rejoindre la partie."}));
$("startBtn").addEventListener("click",()=>start());
$("copyBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(roomId);$("copyBtn").textContent="Code copié ✓"}catch{$("copyBtn").textContent="Copie manuelle : "+roomId}});
$("againBtn").addEventListener("click",()=>location.reload());
