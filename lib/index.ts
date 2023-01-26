import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  Table,
  BillingMode,
  AttributeType,
  StreamViewType,
} from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  FilterCriteria,
  StartingPosition,
  FilterRule,
} from 'aws-cdk-lib/aws-lambda';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { CfnPipe } from 'aws-cdk-lib/aws-pipes';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import {
  Pass,
  StateMachine,
  StateMachineType,
  LogLevel,
  CustomState,
  Chain,
} from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface EloServerlessProps {}

const PK = 'PK';

export class EloServerless extends Construct {
  public table: Table;
  constructor(scope: Construct, id: string, props: EloServerlessProps = {}) {
    super(scope, id);

    const dlq = new Queue(this, 'DLQ', {
      retentionPeriod: Duration.days(14),
    });

    this.table = new Table(this, 'Table', {
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: PK, type: AttributeType.STRING },
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      // to be removed at later stage
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const finalStatus = new Pass(this, 'Final Step');

    const stateJson = {
      Type: 'Task',
      Resource: 'arn:aws:states:::dynamodb:putItem',
      Parameters: {
        TableName: this.table.tableName,
        Item: {
          [PK]: {
            S: 'PLAYER#MACHINE',
          },
          ELO: {
            S: '1',
          },
        },
      },
      ResultPath: null,
    };

    const custom = new CustomState(this, 'Update Score', {
      stateJson,
    });

    const chain = Chain.start(custom).next(finalStatus);

    const targetStateMachine = new StateMachine(
      this,
      'TargetExpressStateMachine',
      {
        definition: chain,
        stateMachineType: StateMachineType.EXPRESS,
        logs: {
          destination: new LogGroup(this, 'TargetLogs', {
            // to be removed at later stage
            removalPolicy: RemovalPolicy.DESTROY,
          }),
          includeExecutionData: true,
          level: LogLevel.ALL,
        },
      },
    );

    const pipeRole = new Role(this, 'PipeRole', {
      assumedBy: new ServicePrincipal('pipes.amazonaws.com'),
    });

    targetStateMachine.grantStartSyncExecution(pipeRole);
    this.table.grantStreamRead(pipeRole);
    this.table.grantWriteData(targetStateMachine);
    dlq.grantSendMessages(pipeRole);

    new CfnPipe(this, 'Pipe', {
      roleArn: pipeRole.roleArn,
      source: this.table.tableStreamArn as string,
      sourceParameters: {
        filterCriteria: {
          filters: [
            FilterCriteria.filter({ eventName: FilterRule.isEqual('INSERT') }),
          ],
        },
        dynamoDbStreamParameters: {
          startingPosition: StartingPosition.TRIM_HORIZON,
          batchSize: 1,
          deadLetterConfig: {
            arn: dlq.queueArn,
          },
        },
      },
      target: targetStateMachine.stateMachineArn,
    });
  }
}
