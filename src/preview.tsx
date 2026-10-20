import React,{useRef,useState}from'react';import{createRoot}from'react-dom/client';import{Pet}from'./pet';import type{Activity}from'./policy';
function Preview(){const[state,setState]=useState<Activity>({busy:false,phase:'thinking'}),seq=useRef(0);return <main style={{font:'14px system-ui',padding:32,color:'#302f2b',background:'#faf9f6',height:'100vh',boxSizing:'border-box'}}>
 <h1>Pixel Agent Pets</h1><p>本地预览 · 无模型请求 · 右键宠物切换，左键预览动作</p>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{(['发送','思考','输出','读取','命令','等待确认','完成','错误']as const).map(label=><button key={label} onClick={()=>setState(label==='完成'?{busy:false,phase:'thinking'}:label==='错误'?{busy:false,phase:'thinking',errorId:String(++seq.current)}:label==='等待确认'?{busy:true,phase:'thinking',awaitingInput:true}:label==='读取'||label==='命令'?{busy:true,phase:'tools',tool:label==='读取'?'view_file':'run_command',toolId:String(++seq.current)}:{busy:true,phase:label==='发送'?'sending':label==='输出'?'responding':'thinking'})}>{label}</button>)}</div>
 <p>状态：{JSON.stringify(state)}</p><label><input type="checkbox" checked={!!state.chineseDraft} onChange={e=>setState({...state,chineseDraft:e.target.checked})}/>输入中文</label>
 <section style={{position:'absolute',bottom:80,left:40,right:40,height:80,borderRadius:22,border:'1px solid #ddd',background:'#fff',padding:20,boxSizing:'border-box'}}><Pet activity={state}/>输入区：宠物只观察状态，不发送或修改任务。</section>
 </main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
