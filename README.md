# 로그인 없는 전자서명 앱

GitHub Pages에 올리는 정적 React/Vite 앱과 Google Apps Script Web App, Google Sheets만으로 동작하는 전자서명 앱입니다. 실제 학생 명단, 서명 이미지, 관리자 비밀번호, 운영용 Apps Script URL은 저장소에 넣지 않는 구성을 기본으로 합니다.

## 폴더 구조

- `frontend`: React + Vite + TypeScript 정적 앱
- `apps-script/Code.gs`: Google Apps Script Web App 코드
- `.github/workflows/deploy-pages.yml`: GitHub Pages 배포 워크플로

## Google Sheets와 Apps Script 설정

1. 새 Google Sheet를 만듭니다.
2. `확장 프로그램 > Apps Script`를 열고 `apps-script/Code.gs` 내용을 붙여넣습니다.
3. Apps Script에서 `initializeSignatureSheets` 함수를 실행합니다.
4. `documents`, `targets`, `audit_logs` 시트가 생성됐는지 확인합니다.
5. 관리자 비밀번호를 설정합니다. 원문 비밀번호를 코드에 쓰지 마세요.
   - 방법 A: Sheet에 바인딩된 Apps Script에서 `setAdminPasswordFromPrompt` 실행
   - 방법 B: Script Properties에 `TEMP_ADMIN_PASSWORD`를 임시 저장한 뒤 `setAdminPasswordFromTemporaryProperty` 실행
6. Script Properties에 선택 값을 설정합니다.
   - `FRONTEND_BASE_URL`: 예 `https://YOUR_ACCOUNT.github.io/signature-app/`
   - `SPREADSHEET_ID`: 바인딩 스크립트가 아닌 경우에만 Sheet ID 입력
7. `배포 > 새 배포 > 웹 앱`을 선택합니다.
   - 실행 권한: 나
   - 액세스 권한: 모든 사용자
8. 배포 후 Web App URL을 복사합니다.

관리자 비밀번호는 `ADMIN_PASSWORD_SALT`, `ADMIN_PASSWORD_HASH`로 Script Properties에 저장됩니다. bcrypt가 아니라 SHA-256 + salt 방식이므로, 강한 비밀번호를 쓰고 Sheet/App Script 편집 권한을 엄격히 제한하세요.

### 초기화했는데 시트가 안 생길 때

가장 흔한 원인은 Apps Script가 Google Sheet에 연결되지 않은 단독 프로젝트인 경우입니다.

1. Apps Script 왼쪽의 `실행 기록`에서 `initializeSignatureSheets` 실행이 성공인지 실패인지 확인합니다.
2. `diagnoseSignatureAppSetup` 함수를 실행하고 로그를 봅니다.
3. 로그의 `target_spreadsheet_url`이 내가 보고 있는 Google Sheet와 같은지 확인합니다.
4. 단독 Apps Script 프로젝트라면 Sheet URL에서 ID를 복사합니다.

```text
https://docs.google.com/spreadsheets/d/여기가_SPREADSHEET_ID/edit
```

5. Apps Script `프로젝트 설정 > 스크립트 속성`에 아래 값을 추가합니다.

```text
SPREADSHEET_ID = 복사한 Sheet ID
```

6. 다시 `initializeSignatureSheets`를 실행합니다.

새 Sheet를 자동으로 만들고 싶다면 `createSignatureSpreadsheet`를 실행해도 됩니다. 실행 후 로그에 나온 `spreadsheet_url`을 열면 `documents`, `targets`, `audit_logs` 시트가 만들어져 있습니다.

## 프론트엔드 로컬 실행

```bash
cd frontend
npm install
cp .env.example .env.local
```

`.env.local`의 `VITE_APPS_SCRIPT_URL`에 Web App URL을 넣고 실행합니다.

```bash
npm run dev
npm run build
```

런타임 설정 파일을 쓰려면 `frontend/config.example.json`을 `frontend/public/config.json`으로 복사한 뒤 값을 채웁니다. `config.json`과 `.env.local`은 `.gitignore`에 포함되어 있습니다.

## GitHub Pages 배포

1. GitHub 저장소 Settings에서 Pages 소스를 `GitHub Actions`로 설정합니다.
2. Repository Secrets에 `APPS_SCRIPT_WEB_APP_URL`을 추가합니다.
3. 선택으로 `PUBLIC_APP_BASE_URL`을 추가합니다. 예 `https://YOUR_ACCOUNT.github.io/signature-app/`
4. `main` 브랜치에 push하거나 Actions에서 수동 실행합니다.

서명 링크 형식:

```text
https://YOUR_ACCOUNT.github.io/signature-app/#/sign?doc=PUBLIC_TOKEN
```

관리자 화면:

```text
https://YOUR_ACCOUNT.github.io/signature-app/#/admin
```

## 운영 흐름

1. 관리자가 `#/admin`에서 로그인합니다.
2. 새 문서를 만들고 공개 링크를 복사합니다.
3. 대상자 명단을 붙여넣어 등록합니다. 형식은 `학교명,학번,이름` 또는 `학번,이름`입니다.
4. 서명자는 공개 링크에서 학교명, 학번, 이름을 입력합니다.
5. Apps Script가 Sheets의 `targets`와 대조합니다.
6. 일치하면 15분짜리 단기 `target_token`이 발급됩니다.
7. 서명 PNG data URL 제출 시 `targets` 행에 서명, 제출 시각, User-Agent가 저장됩니다.
8. 이미 제출한 대상자는 재제출할 수 없습니다.
9. 관리자는 문서 상세에서 현황을 보고 `출력/PDF`로 A4 미리보기를 인쇄합니다.

## Sheets 구조

`documents`

```text
document_id, public_token, title, school_name, event_date, retention_until, status, created_at
```

`targets`

```text
target_id, document_id, school_name, student_number, name, status, signed_at, signature_data, user_agent, created_at, updated_at
```

`audit_logs`

```text
log_id, actor_type, action, document_id, target_id, details_json, user_agent, created_at
```

## API

- `GET ?action=health`
- `POST verifyTarget`: `public_token`, `school_name`, `student_number`, `name`
- `POST submitSignature`: `public_token`, `target_token`, `signature_data`
- `POST adminLogin`: `password`
- `POST adminListDocuments`: `session_token`
- `POST adminGetDocument`: `session_token`, `document_id`
- `POST adminCreateDocument`: `session_token`, `title`, `school_name`, `event_date`, `retention_until`
- `POST adminUpsertTargets`: `session_token`, `document_id`, `targets`

브라우저 요청은 CORS preflight를 피하기 위해 custom Authorization header를 쓰지 않습니다. 프론트엔드는 `Content-Type: text/plain;charset=utf-8`로 JSON 문자열을 전송하고, Apps Script는 `JSON.parse(e.postData.contents)`로 처리합니다.

## 개인정보와 보안 주의

- 실제 학생 명단과 서명 이미지는 GitHub 저장소에 넣지 마세요.
- Apps Script URL, Sheet ID, 관리자 비밀번호 원문, 운영 데이터는 커밋하지 마세요.
- Apps Script Web App URL은 프론트에서 호출되므로 브라우저에는 노출됩니다. 비밀값으로 취급하지 말고 서버 권한 검증을 Apps Script에서 수행하세요.
- IP 주소는 Apps Script Web App에서 안정적으로 얻기 어렵습니다. 이 앱은 가능한 메타데이터로 브라우저가 보낸 User-Agent를 저장합니다.
- `public_token`은 긴 랜덤 토큰이지만, 링크를 가진 사람은 확인 화면에 접근할 수 있습니다.
- 실패 응답은 어떤 항목이 틀렸는지 알려주지 않습니다.
- 서명 이미지는 관리자 API에서만 내려줍니다.
- Google Sheet 공유 권한을 최소화하고, `retention_until` 이후 운영자가 데이터를 삭제하는 절차를 두세요.
- Google Sheets 셀 한도 때문에 서명 data URL은 45,000자 이하로 제한했습니다.

## Smoke Test 체크리스트

- 로컬에서 `npm run build` 통과
- Apps Script `GET ?action=health` 응답 확인
- 관리자 로그인 성공
- 문서 생성 후 공개 링크 생성
- 테스트용 더미 대상자 등록
- 공개 링크에서 대상자 확인 성공
- 데스크톱 Chrome에서 서명 제출 성공
- 모바일 Chrome 또는 Safari에서 터치 서명 제출 성공
- 이미 제출한 대상자 재제출 차단
- 관리자 화면에서 서명 이미지와 제출 시각 확인
- A4 미리보기에서 페이지당 30명, 15명 x 2단 출력 확인
- 브라우저 인쇄에서 PDF 저장 확인
- Apps Script 실행 로그에 오류가 없는지 확인
