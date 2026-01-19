
import { useEffect, useRef, useState } from 'react';
import './App.css'

function App() {

  const [socket,setSocket] = useState()
  const inputRef = useRef(null);

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
      alert(ev.data);
    }

  },[])

  return (
    <div>
      <input ref={inputRef}  type="text" placeholder = "text"></input>
      <button onClick={sendMessage}>click</button>
    </div>
  )
}

export default App
