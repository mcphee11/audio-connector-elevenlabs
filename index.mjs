import { WebSocketServer, WebSocket } from 'ws'
import dotenv from 'dotenv'
import http from 'http'

// Load environment variables from .env file
dotenv.config()

const AH_port = 8081
const MAXIMUM_BINARY_MESSAGE_SIZE = 64000
const AGENT_ID = process.env.AGENT_ID
const API_KEY = process.env.API_KEY // required for private access
const public_access = process.env.PUBLIC_ACCESS || true
let genesysWs = null
let elevenLabsWs = null
let clientseq = 0
let seq = 1
let parsedMessageId = ''
let socketId = 1

const server = http.createServer((req, res) => {
  if (req.url === '/1234') {
    // correct GET based on Genesys Cloud architect "Connector ID"
    console.log('GET /1234')
    res.writeHead(200, { 'Content-Type': 'application/json' })
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

server.listen(AH_port, () => {
  console.log(`HTTP Server listening on port ${AH_port}`)
})

genesysWs = new WebSocketServer({ server })
genesysWs.on('connection', (ws) => {
  setupElevenLabs()
  console.log(`Client connected`)
  ws.id = socketId

  ws.on('message', (message) => {
    // types of messages
    try {
      const parsedMessage = JSON.parse(message)
      parsedMessageId = parsedMessage.id
      switch (parsedMessage.type) {
        case 'ping':
          console.log(`Received PING: ${message.toString()}`)
          let msgPing = {
            version: '2',
            type: 'pong',
            seq: seq++,
            clientseq: clientseq++,
            id: parsedMessage.id,
            parameters: {},
          }
          console.log(`Sending PONG: ${JSON.stringify(msgPing)}`)
          ws.send(JSON.stringify(msgPing))
          break
        case 'open':
          console.log(`Received OPEN: ${message.toString()}`)
          let msgOpen = {
            version: '2',
            type: 'opened',
            seq: seq++,
            clientseq: clientseq++,
            id: parsedMessage.id,
            parameters: {
              media: [{ type: 'audio', format: 'PCMU', channels: ['external'], rate: 8000 }],
            },
          }
          console.log(`Sending OPENED: ${JSON.stringify(msgOpen)}`)
          ws.send(JSON.stringify(msgOpen))
          break
        case 'playback_started':
          console.log(`Received playback_started: ${message.toString()}`)
          break
        case 'playback_completed':
          console.log(`Received playback_completed: ${message.toString()}`)
          break
        case 'close':
          console.log(`Received PING: ${message.toString()}`)
          let msgClose = {
            version: '2',
            type: 'closed',
            seq: seq++,
            clientseq: clientseq++,
            id: parsedMessage.id,
            parameters: {},
          }
          console.log(`Sending CLOSED: ${JSON.stringify(msgClose)}`)
          ws.send(JSON.stringify(msgClose))
          break
        case 'update':
          // not handled currently
          console.warn(`Received UPDATE: ${message.toString()}`)
        default:
          console.error(`Received ERROR: ${message.toString()}`)
      }
    } catch (e) {
      // STREAMING DATA
      if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
        const base64 = Buffer.from(message).toString('base64')
        const payload = {
          user_audio_chunk: base64,
        }
        elevenLabsWs.send(JSON.stringify(payload))
        console.log(`Sending to ElevenLabs`)
      }
    }
  })

  ws.on('close', () => {
    console.log(`Client disconnected`)
    elevenLabsWs.close()
  })

  ws.on('error', (error) => {
    console.error(`Client error ${error}`)
  })
})
console.log(`Audio Hook WebSocket server started on port ${AH_port}`)

// ---------------------------------------------

// Connect to ElevenLabs Conversational AI WebSocket

// Set up ElevenLabs connection
const setupElevenLabs = async () => {
  try {
    if (public_access) {
      elevenLabsWs = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${AGENT_ID}`)
    }
    if (!public_access) {
      const signedUrl = await getSignedUrl()
      elevenLabsWs = new WebSocket(signedUrl)
    }

    elevenLabsWs.on('open', () => {
      console.log('[ElevenLabs] Connected to Conversational AI')
      const initialConfig = {
        type: 'conversation_initiation_client_data',
        dynamic_variables: {},
        conversation_config_override: {
          agent: {},
          tts: {},
        },
      }
      console.log('[ElevenLabs] Sending initial config')
      elevenLabsWs.send(JSON.stringify(initialConfig))
    })

    elevenLabsWs.on('message', (data) => {
      console.log('[ElevenLabs] Received message:', data)
      try {
        const message = JSON.parse(data)

        switch (message.type) {
          case 'conversation_initiation_metadata':
            console.log('[ElevenLabs] Received initiation metadata')
            break

          case 'audio':
            console.log('[ElevenLabs] Received audio')
            if (genesysWs) {
              const targetClientId = socketId
              const targetClient = Array.from(genesysWs.clients).find((client) => client.id === targetClientId)

              if (targetClient && targetClient.readyState === WebSocket.OPEN) {
                if (message.audio_event.audio_base_64.length <= MAXIMUM_BINARY_MESSAGE_SIZE) {
                  console.log('sending in 1 message to specific GenesysWs client')
                  let buffer = Buffer.from(message.audio_event.audio_base_64, 'base64')
                  targetClient.send(buffer, { binary: true })
                } else {
                  let currentPosition = 0
                  while (currentPosition < message.audio_event.audio_base_64.length) {
                    const sendBytes = message.audio_event.audio_base_64.slice(currentPosition, currentPosition + MAXIMUM_BINARY_MESSAGE_SIZE)

                    console.log(`Sending ${sendBytes.length} binary bytes in chunked message to specific GenesysWs client`)
                    targetClient.send(sendBytes, { binary: true })
                    currentPosition += MAXIMUM_BINARY_MESSAGE_SIZE
                  }
                }
              }
            }
            break
          case 'ping':
            if (message.ping_event?.event_id) {
              elevenLabsWs.send(
                JSON.stringify({
                  type: 'pong',
                  event_id: message.ping_event.event_id,
                })
              )
            }
            break

          case 'agent_response':
            console.log(`[PBX] Agent response: ${message.agent_response_event?.agent_response}`)
            break

          case 'user_transcript':
            console.log(`[PBX] User transcript: ${message.user_transcription_event?.user_transcript}`)
            break

          default:
            console.log(`[ElevenLabs] Unhandled message type: ${message.type}`)
        }
      } catch (error) {
        console.error('[ElevenLabs] Error processing message:', error)
      }
    })

    elevenLabsWs.on('error', (error) => {
      console.error('[ElevenLabs] WebSocket error:', error)
    })

    elevenLabsWs.on('close', (disconnect) => {
      if (genesysWs) {
        const targetClientId = socketId
        const targetClient = Array.from(genesysWs.clients).find((client) => client.id === targetClientId)
        console.log('[ElevenLabs] Disconnected: ', disconnect)

        let msgDisconnect = {
          version: '2',
          type: 'disconnect',
          seq: seq++,
          clientseq: clientseq++,
          id: parsedMessageId,
          parameters: {
            reason: 'completed',
            outputVariables: {},
          },
        }
        targetClient.send(JSON.stringify(msgDisconnect))
        console.log(`Sending DISCONNECT to GenesysWs: ${JSON.stringify(msgDisconnect)}`)
      }
    })
  } catch (error) {
    console.error('[ElevenLabs] Setup error:', error)
  }
}

// Helper function to get signed URL for authenticated conversations
async function getSignedUrl() {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${AGENT_ID}`, {
      method: 'GET',
      headers: {
        'xi-api-key': API_KEY,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('Signed URL:', data.signed_url)
    return data.signed_url
  } catch (error) {
    console.error('Error getting signed URL:', error)
    throw error
  }
}
