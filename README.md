# audio-connector-elevenlabs

This is a POC for Genesys Cloud Audio Connector (Voice BOT) to ElevenLabs this is NOT production code, more a simple single mjs file approach to show the basics. For a more complete example on the Genesys Side there is a TypeScript app [here](https://github.com/GenesysCloudBlueprints/audioconnector-server-reference-implementation)

This example leverages the ElevenLabs `Conversation AI` BOT capability via the `WebSocket API` integration for realtime streaming of audio to and from ElevenLabs and Genesys Cloud.

## Genesys Cloud Integration

You will need to install the `Audio Connector` Integration

![](/docs/img/connector.png?raw=true)

```
Base Connection URI: wss://YOUR_SERVER
```

In my example I'm not leveraging the `Credentials` in a production environment you should use this of course. To keep it simple this is not used though in this example so you can set it to whatever you require.

Once published you can add the `call audio connector` block in architect. I have the `GET` request using

```
Connector ID: 1234
```

This is in the code so you will need to also set this or change it to what you require it to be based on your server needs.

![](/docs/img/flow.png?raw=true)

## ElevenLabs Agent

In the ElevenLabs Agent configuration you will need to ensure that the audio is set to use `u-law 8000 Hz` this is set in 2x locations:

```
Voice -> TTS output format: u-law 8000 Hz
Advanced -> User input audio format: u-law 8000 Hz
```

![](/docs/img/voice-settings.png?raw=true)

![](/docs/img/advanced-settings.png?raw=true)

Depending on if your agent is set to `Enable authentication` or not will depend on how you set the environment variables for your server. You can check your ElevenLabs Agent auth under the `Security` tab in the agent config.

## Server settings

When running the server there are some environement variables that are used for the configuration:

```
AH_PORT (optional - default 8081)
AGENT_ID
API_KEY (optional used for auth)
```

As above the `AGENT_ID` is key and the others are used depending on if your agent is public or private with an API key. If running the server locally for testing you can use a `.env` file to save these in.

## Final thoughts

This is once again a POC example and not built for production but for simple visibility on how this can work from a flat mjs file this will run well. Personally I run this using [Ngrok](https://ngrok.com/) on my local machine for testing and it runs well.

I also plan to make a reference for the ElevenLabs TTS which will be a good option if you like the TTS but want to use a native Genesys Cloud BOT or a different NLU component.
