# Welcome to your CDK TypeScript Construct Library project

You should explore the contents of this project. It demonstrates a CDK Construct Library that includes a construct (`EloServerless`)
which contains an Amazon SQS queue that is subscribed to an Amazon SNS topic.

The construct defines an interface (`EloServerlessProps`) to configure the visibility timeout of the queue.

## Setup

The `lib` folder contains the CDK code used to deploy the `EloServerless` stack. The `test` folder defines the integration test that interacts with the `EloServerless` stack to check that it behaves as expected.
To setup your development environment:

- Run `pnpm run build` to transpile the content of the `test` folder
- Run `pnpm cdk bootstrap aws://<YOUR_AWS_SSO_ACCOUNT_ID>/eu-west-1 --profile <YOUR_AWS_PROFILE>` to deploy a bootstrap stack (if you don't have one already)
- Run `pnpm cdk deploy --app 'node test/integ.elo.js' --all --profile <YOUR_AWS_PROFILE>` to deploy and test the `EloServerless` stack
