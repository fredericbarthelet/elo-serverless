import { RemovalPolicy } from 'aws-cdk-lib';
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
  TaskInput,
} from 'aws-cdk-lib/aws-stepfunctions';

import { Construct } from 'constructs';
import { Role } from 'aws-cdk-lib/aws-iam';
import {
  DynamoAttributeValue,
  DynamoGetItem,
} from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Table } from 'aws-cdk-lib/aws-dynamodb';

export class StateMachineConstruct extends Construct {
  public stateMachine: IStateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: { pipeRole: Role; table: Table },
  ) {
    super(scope, id);

    const passParsePayload = new Pass(this, 'Pass Parse Payload', {
      parameters: {
        payloadEvent: JsonPath.stringToJson(
          JsonPath.stringAt('$.dynamodb.NewImage.Payload.S'),
        ),
      },
    });

    const passTransformToArray = new Pass(this, 'Pass Transform To Array', {
      parameters: {
        playersArray: JsonPath.array(
          JsonPath.stringAt('$.payloadEvent.PlayerA.S'),
          JsonPath.stringAt('$.payloadEvent.PlayerB.S'),
        ),
        // 'States.Array($.payloadEvent.PlayerA.S,$.payloadEvent.PlayerB.S)',
      },
    });

    const passSum = new Pass(this, 'Pass Sum', {
      parameters: {
        sum: JsonPath.mathAdd(
          JsonPath.numberAt('$.firstRanking'),
          JsonPath.numberAt('$.secondRanking'),
        ),
      },
    });

    // Inner map
    const mapGetItems = new Map(this, 'Map Get Items', {
      itemsPath: JsonPath.stringAt('$.playersArray'),
    });
    mapGetItems.iterator(
      new DynamoGetItem(this, 'Dynamo Get Item', {
        key: {
          PK: DynamoAttributeValue.fromString(JsonPath.stringAt('$')),
        },
        table: props.table,
      }),
    );
    mapGetItems.next(
      new Pass(this, 'Succeed Map GetItem', {
        parameters: {
          firstRanking: JsonPath.stringToJson(
            JsonPath.stringAt('$[0].Item.ELO.N'),
          ),
          secondRanking: JsonPath.stringToJson(
            JsonPath.stringAt('$[1].Item.ELO.N'),
          ),
        },
      }).next(passSum),
    );

    // Outer map
    const mapStreamEvents = new Map(this, 'Map Stream Events', {
      itemsPath: JsonPath.stringAt('$'),
    });
    mapStreamEvents.iterator(
      passParsePayload.next(passTransformToArray).next(mapGetItems),
    );
    mapStreamEvents.next(new Succeed(this, 'Succeed'));

    this.stateMachine = new StateMachine(this, 'TargetExpressStateMachine', {
      definition: mapStreamEvents,
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

    this.stateMachine.grantStartSyncExecution(props.pipeRole);
  }
}
