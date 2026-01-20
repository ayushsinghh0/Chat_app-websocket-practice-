
import { useEffect, useRef, useState } from 'react';
import './App.css'

function App() {

  const [socket,setSocket] = useState()
  const inputRef = useRef("");
  const [texti,Settexti]=useState([]);

  function sendMessage(){
    if(!socket){
      return;
    }
   
    const message = inputRef.current.value;
    socket.send(message);
  }

  useEffect(()=>{
    const ws =new WebSocket("ws://localhost:8080")
    setSocket(ws)

    ws.onmessage=(ev)=>{
      texti.push(ev.data)
      alert(ev.data);
    }

  },[])

  return (
    <div>
      <div>
        {texti.map()}

      </div>
      <input ref={inputRef}  type="text" placeholder = "text"></input>
      <button onClick={sendMessage}>click</button>
    </div>
  )
}

export default App
