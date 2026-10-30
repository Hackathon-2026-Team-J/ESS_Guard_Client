# 연결된 서버 API 계약

확인 기준: ESS_Guard_server `a7e0ae3` 및 배포 서버 OpenAPI.
대상: `http://13.125.65.202:8080`
클라이언트 호출 경로: 같은 출처 `/api` (개발/preview 프록시 사용).
요청/응답은 JSON이며 재생 제어 POST에 본문은 없습니다.

## 통계

`GET /api/stats`

```json
{
  "processedCount": 0,
  "totalCount": 230,
  "detectionCount": 0,
  "labeledAnomalyCount": 30,
  "severityCounts": {},
  "ruleCounts": {}
}
```

모든 값은 서버 전체 기준이며 날짜·설비 필터 파라미터가 없습니다. processedCount·totalCount·labeledAnomalyCount는 명령만 집계하고, detectionCount는 명령/측정값 기반 이벤트 모두를 집계합니다. 측정값 처리 건수는 미제공입니다.
생략된 위험도/규칙 키는 0건입니다.
`detectionCount`는 이벤트 수, `labeledAnomalyCount`는 평가용 이상 정답 라벨 명령 수입니다.
전체 중복 제거 탐지 명령 수를 제공하는 필드는 없습니다.

## 최근 탐지

`GET /api/events?limit=200` (서버 기본 50, 최소 1)

최신 ID 순 배열이며 offset/page/cursor 및 검색 조건은 없습니다.
클라이언트는 최대 200건을 받아 탐지 시각 최신 순으로 정렬하고 로컬 필터·페이지를 적용합니다.

```json
[
  {
    "id": 1,
    "ruleId": "R1",
    "severity": "HIGH",
    "message": "계획 방향(충전)과 반대인 방전 명령",
    "detectedAt": "2026-11-07T09:01:02",
    "commandLogId": 4,
    "telemetryId": null,
    "clientId": "HMI-01",
    "role": "MONITOR",
    "deviceId": "ESS-02",
    "functionCode": 6,
    "registerAddress": 11,
    "value": 20,
    "essState": "RUNNING"
  }
]
```

- 위험도: CRITICAL / HIGH / MEDIUM
- 역할: OPERATOR / MONITOR / MAINTENANCE / UNKNOWN
- 설비 상태: STOPPED / RUNNING / MAINTENANCE / FAULT / null
- `value`는 원시 정수입니다.
- `detectedAt`은 서버의 LocalDateTime이며 배포 시간대 Asia/Seoul 기준으로 해석합니다.
- `issuedAt`, `processed`, `labeledAnomaly`는 없습니다. 명령 상세에서는 미제공으로 표시합니다.
- 동일 명령/측정값의 연결 탐지 목록도 현재 수신한 이벤트 범위 내 결과입니다. 두 ID 공간은 구분합니다.
- 측정값 기반 이벤트는 commandLogId·clientId·role·functionCode·registerAddress·value·essState가 null이고 telemetryId가 채워집니다. deviceId는 이벤트 자체에서 조회합니다.
- telemetryId 누락은 이전 응답 호환을 위해 null로 취급합니다. 과거 이력의 빈 deviceId는 추측해서 채우지 않습니다.
- ruleId는 문자열입니다. 현재 R1–R4 외의 식별자도 보존하되 최신 규칙 이름으로 추정하지 않습니다.
- 규칙 버전, 명령 commandKw, 계획 plannedKw, 측정 measuredAt·actualKw·soc, 구조화된 예상 변화량·잔차는 EventResponse에 없습니다. message를 파싱해 이 값을 만들지 않습니다.

## 선택적 계측 호환과 시뮬레이션

현재 배포 서버는 SOC·실측 출력·계획/명령/실제 시계열을 반환하지 않습니다. 서버 코드는 변경하지 않습니다.
클라이언트의 선택적 `GET /api/telemetry/latest` 확인이 404이면 반복 요청을 중단하고 가상 SOC·전력 화면을 사용합니다. 응답을 지원하는 별도 서버에는 다음 형식으로 호환됩니다.

```json
[{"id":12,"deviceId":"ESS-01","measuredAt":"2026-10-31T14:32:07","actualKw":-50,"soc":63.5}]
```

- 실제 수신값이 있으면 우선 표시합니다. 0%와 미수신은 구분하며, 오류 시 이전 수신 표시를 붙입니다. SSE reset은 캐시와 진행 중 응답을 무효화합니다.
- 가상 시계열은 수신한 설비별 탐지 ID·규칙을 시나리오 선택에만 사용합니다. 경고 메시지나 원시 명령 정수 `value`로 실측 kW를 추정하지 않습니다.
- 가상 SOC·출력은 500 kWh, 120배 가속 모델이며 R4는 의도적으로 SOC 불일치를 표현합니다. 최초 가상 1시간은 생성된 데이터입니다. 계획·명령·실제(모의), 충전·방전 합계 모두 실측과 구분하여 표시합니다.
- 이 시뮬레이션은 실제 PCS별 출력, 과거 탐지 당시 값, 발전량/전력량을 복원하지 않습니다.

## 실시간 알림

`GET /api/stream` — text/event-stream

- 이름 `detection`: 위 이벤트와 같은 JSON.
- 이름 `reset`: 문자열 `reset`.
- 초기 알림, heartbeat, SSE id, Last-Event-ID 재전송 버퍼는 없습니다.

클라이언트는 이벤트 ID로 중복을 제거하고 EventSource의 재연결을 사용합니다.
연결/재연결 시 다시 조회하며, 3초 주기 조회로 누락과 정상 명령의 처리 진행을 보완합니다.
reset을 받으면 이벤트 캐시와 상세 선택을 지우고 이전 조회 응답이 캐시를 되살리지 못하도록 무효화합니다.
탐지 알림은 서버 트랜잭션 커밋 전에 올 수 있으므로 알림 뒤 400ms 후 재조회하고 주기적으로 동기화합니다.
통계는 SSE 개수로 추정하지 않고 통계 API 응답으로만 갱신합니다 (reset의 명시적 초기화 상태 제외).

## 재생 제어

| 요청 | 동작 |
|---|---|
| POST /api/replay/start | 명령·측정값을 시각순으로 재생 시작 |
| POST /api/replay/stop | 명령 재생 정지 |
| POST /api/replay/reset | 재생 정지, 탐지 결과 전체 삭제, 명령·측정값 processed 초기화 |

응답:

```json
{"running": false, "processedCount": 0}
```

현재 재생 상태를 읽는 GET API는 없습니다.
응답의 `running`은 응답 시점 기준이며, 자동 종료나 다른 사용자의 제어로 이후 상태는 달라질 수 있습니다.
reset은 자동으로 재생을 다시 시작하지 않습니다.
제어 요청 중 버튼을 잠그며 네트워크 실패 시 POST를 자동 재시도하지 않습니다.
오류나 시간 초과에서는 실제 서버 반영 여부가 불확실할 수 있다는 안내를 표시합니다.

## 아직 연결할 수 없는 기능

전체 명령 목록·개별 명령 상세·전체 탐지 명령 집계·서버 페이지 검색·규칙 설정 편집·재생 상태/측정 처리 진행 조회·전 구간 계측·물리 검증 시계열/계산 결과 조회 API가 필요합니다. 물리 검증 R4 알림은 기존 events/stream으로 연결됩니다.
이 API들은 현재 존재하는 것으로 가정하지 않으며 호출하지 않습니다.


## 현재 규칙과 물리 검증 표시 범위

R1은 계획 방향 불일치, R2는 출력 편차, R3은 잦은 방향 전환, R4는 SOC 물리 불일치입니다. 기존 ID의 의미가 바뀌었으므로 규칙 버전이 없는 과거 이력에 현재 규칙 이름을 적용하지 않습니다.

물리 화면은 ruleId=R4, telemetryId!=null, commandLogId=null인 이벤트만 포함합니다. 명령 기반의 과거 R4는 제외합니다.
서버 모델은 이전 actualKw와 경과 시간, 500 kWh로 예상 SOC 변화를 계산합니다. 잔차가 |예상 변화|의 15% 초과이고 0.5 %p 이상일 때 탐지합니다.
직전 2분 내 명령 탐지가 있으면 R4 이벤트 생성을 생략하므로 탐지가 없다는 이유로 정상 상태를 표시하지 않습니다.

서버팀에는 아래 조회 계약을 요청해야 합니다. 아래 경로는 제안이며 현재 호출하지 않습니다.

- GET /api/telemetry: deviceId, from/to, 측정 ID·시각, actualKw, soc, 품질, 실행 ID, 페이지 정보
- GET /api/dispatch-plans: 설비·적용 기간·계획 출력(kW)
- GET /api/physical-checks 및 상세: 원인 측정 ID, 분석 구간, 예상/실제 SOC 변화, 잔차, 임계값, 모델 버전, 정상/이상/생략/데이터 부족 상태, 생략 사유
- GET /api/replay/status: running, runId, 시나리오 시각, 명령·측정값 각각의 처리/전체 건수
- 전 구간 관측 경로·지점별 계측값·비교 결과 조회: 공통 설비 ID, 관측 지점 ID, 프로토콜, 단위·시간 정렬·품질 정보

원본 시나리오 데이터 전환은 서버팀 작업입니다. CSV 로더는 기존 데이터가 있으면 적재를 건너뛰며 reset은 원본 데이터를 교체하지 않습니다.
