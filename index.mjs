import { WebSocketServer, WebSocket } from 'ws'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

const AH_port = 8081
const genesysWs = new WebSocketServer({ port: AH_port })

const AGENT_ID = process.env.AGENT_ID
const API_KEY = process.env.API_KEY
let elevenLabsWs = null

genesysWs.on('connection', (ws) => {
  console.log(`Client connected`)

  ws.on('message', (message) => {
    // types of messages
    try {
      const parsedMessage = JSON.parse(message)
      if (parsedMessage.type === 'ping') {
        console.log(`Received PING: ${message.toString()}`)
        let msg = {
          version: '2',
          type: 'pong',
          seq: parsedMessage.seq,
          clientseq: parsedMessage.serverseq + 1,
          id: parsedMessage.id,
          parameters: {},
        }
        console.log(`Sending PONG: ${JSON.stringify(msg)}`)
        ws.send(JSON.stringify(msg))
        return
      }
      if (parsedMessage.type === 'open') {
        console.log(`Received OPEN: ${message.toString()}`)
        let msg = {
          version: '2',
          type: 'opened',
          seq: parsedMessage.seq,
          clientseq: parsedMessage.serverseq + 1,
          id: parsedMessage.id,
          parameters: {
            media: [{ type: 'audio', format: 'PCMU', channels: ['external'], rate: 8000 }],
          },
        }
        console.log(`Sending OPENED: ${JSON.stringify(msg)}`)
        ws.send(JSON.stringify(msg))
        return
      }
      if (parsedMessage.type === 'close') {
        console.log(`Received PING: ${message.toString()}`)
        let msg = {
          version: '2',
          type: 'closed',
          seq: parsedMessage.seq,
          clientseq: parsedMessage.serverseq + 1,
          id: parsedMessage.id,
          parameters: {},
        }
        console.log(`Sending CLOSED: ${JSON.stringify(msg)}`)
        ws.send(JSON.stringify(msg))
        return
      } else {
        console.error(`Received ERROR: ${message.toString()}`)
        return
      }
    } catch (e) {
      // STREAMING DATA
      console.log('received data')
      elevenLabsWs.send(JSON.stringify(message))
    }
  })

  ws.on('close', () => {
    console.log(`Client disconnected`)
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
    //const signedUrl = await getSignedUrl()
    //elevenLabsWs = new WebSocket(signedUrl)
    elevenLabsWs = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${AGENT_ID}`)

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
            if (streamSid) {
              if (message.audio?.chunk) {
                const audioData = {
                  event: 'media',
                  streamSid,
                  media: {
                    payload: message.audio.chunk,
                  },
                }
                genesysWs.send(JSON.stringify(audioData))
              } else if (message.audio_event?.audio_base_64) {
                const audioData = {
                  event: 'media',
                  streamSid,
                  media: {
                    payload: message.audio_event.audio_base_64,
                  },
                }
                genesysWs.send(JSON.stringify(audioData))
              }
            } else {
              console.log('[ElevenLabs] Received audio but no StreamSid yet')
            }
            break

          case 'interruption':
            if (streamSid) {
              ws.send(
                JSON.stringify({
                  event: 'clear',
                  streamSid,
                })
              )
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
      console.log('[ElevenLabs] Disconnected: ', disconnect)
    })
  } catch (error) {
    console.error('[ElevenLabs] Setup error:', error)
  }
}

// Set up ElevenLabs connection
setupElevenLabs()

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
