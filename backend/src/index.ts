import WebSocket, {WebSocketServer} from "ws";

interface Schema {
    
    socket:WebSocket,
    room:string
}
const allSocket:Schema[]=[];

const wss = new WebSocketServer( { port: 8080});

wss.on("connection",function(socket){
    socket.on("message",function(e){
        //@ts-ignore
        const signal=JSON.parse(e);
        if(signal.type=="join"){
            allSocket.push({
                socket,
                room:signal.payload.roomId
            })
        }

        if(signal.type=="chat"){
            let sameroom=null
            
            for(let i=0;i<allSocket.length;i++){
                if(allSocket[i]?.socket==socket){
                    console.log("user want to connect");
                    sameroom=allSocket[i]?.room
                }
            }

            for(let i=0;i<allSocket.length;i++){
                if(allSocket[i]?.room==sameroom){
                    allSocket[i]?.socket.send(signal.payload.message);
                }
            }
        }

    })
})
