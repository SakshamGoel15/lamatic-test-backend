  // Import necessary libraries
  const express = require('express');
  const { ApolloServer, gql } = require('apollo-server-express');
  const { createServer } = require('http');
  const { execute, subscribe, print } = require('graphql');
  const { makeExecutableSchema } = require('@graphql-tools/schema');
  const { useServer } = require('graphql-ws/lib/use/ws');
  const { PubSub } = require('graphql-subscriptions');
  const { WebSocketServer } = require('ws');
  const { OpenAI } = require('openai');
  require('dotenv').config();
  const { v4 } = require('uuid');

  // Initialize the PubSub system
  const pubSub = new PubSub();
  const STREAM_RESULT = 'STREAM_RESULT';
  let messageUUID = v4();

  // Define your GraphQL schema
  const typeDefs = gql`
    type Query {
      getResponse(prompt: String!): String
    }

    type Subscription {
      streamResult: String
      isFinished: Boolean
    }
  `;

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let currentWord = ""

  const updateStream = (response) => {
  }

  // Define your resolvers
  const resolvers = {
    Query: {
      getResponse: async (_, { prompt }) => {
        const AGENT = 'chat-gpt-3.5-turbo-0125';
        const stream = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo-0125',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        });
        for await (const chunk of stream) {
          const finished = chunk.choices[0].finish_reason;
          if (!finished) {
            let response = chunk.choices[0].delta.content
            if(response[0] == " " || response[0] == "\n") {
              pubSub.publish(STREAM_RESULT, {
                streamResult: JSON.stringify({
                  response: currentWord,
                  isFinished: false,
                  agent: AGENT,
                  messageUUID,
                }),
              });
              currentWord = "";
            }
            currentWord += response;
            currentWord = currentWord.replaceAll(/saksham/gi, "Aman");
            // if(currentWord.trim().toLowerCase() == "saksham") {
            //   currentWord = " Aman";
            // }
          } else {
            pubSub.publish(STREAM_RESULT, {
              streamResult: JSON.stringify({
                response: currentWord,
                isFinished: true,
                agent: AGENT,
                messageUUID,
              }),
            });
            currentWord = "";
            messageUUID = v4();
          }
        }
      },
    },
    Subscription: {
      streamResult: {
        subscribe: () => pubSub.asyncIterator([STREAM_RESULT]),
      },
    },
  };

  // Create the executable schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Initialize Express
  const app = express();
  app.use(require('cors')());
  app.get('/', (req, res) => {
    res.send('Hello World!');
  })


  // Then, when applying middleware to the ApolloServer instance:

  // Create a server from Express app
  const httpServer = createServer(app);

  // Create an instance of ApolloServer
 // const apolloServer = new ApolloServer({ schema });
  const apolloServer = new ApolloServer({
    schema,
    introspection: true, // Enables introspection of the schema
    playground: true, // Forces the playground to be available in production
  });
  // Start Apollo Server

  async function startServer() {
    await apolloServer.start();
    apolloServer.applyMiddleware({ app });

    // Correct instantiation of WebSocketServer
    const wsServer = new WebSocketServer({
      server: httpServer,
      path: '/graphql',
    });

    useServer(
      {
        schema,
        execute,
        subscribe,
      },
      wsServer
    );

    const PORT = process.env.PORT || 4000;
    httpServer.listen(PORT, () => {
      console.log(
        `Server is now running on http://localhost:${PORT}${apolloServer.graphqlPath}`
      );
    });
  }

  // Call startServer to boot up
  startServer();
