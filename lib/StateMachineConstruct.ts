import { RemovalPolicy } from 'aws-cdk-lib';
import { Key } from 'aws-cdk-lib/aws-kms';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import {
  IStateMachine,
  JsonPath,
  StateMachine,
  LogLevel,
  StateMachineType,
  Pass,
  Map,
  Succeed,
} from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export class StateMachineConstruct extends Construct {
  public stateMachine: IStateMachine;

  constructor(scope: Construct, id: string, pipeRole: Role) {
    super(scope, id);

    const map = new Map(this, 'Map State', {
      itemsPath: JsonPath.stringAt('$'),
    });

    map.iterator(
      new Pass(this, 'PassState', {
        inputPath: JsonPath.stringAt('$.dynamodb.NewImage.Payload.S'),
      }),
    );

    map.next(new Succeed(this, 'Succeed'));

    this.stateMachine = new StateMachine(this, 'TargetExpressStateMachine', {
      definition: map,
      stateMachineType: StateMachineType.EXPRESS,
      logs: {
        destination: new LogGroup(this, 'TargetLogs', {
          // to be removed at later stage
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        includeExecutionData: true,
        level: LogLevel.ALL,
      },
    });

    this.stateMachine.grantStartSyncExecution(pipeRole);
  }
}
