## Weather Assistant using OpenAI Function Calling

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Next steps:

<del>***History***: create /api/history endpoint that will receive threadId in payload and return previous messages.</del>

***Cache***: Cache Open Weather API response to prevent multiple calls in small period.

***Unit tests***: Write API unit tests.

***Improve error handling***: Differentiate user and system errors.
