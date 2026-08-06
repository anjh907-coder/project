/* ==========================================================================
   실시간 점심메뉴 투표 스크립트 (script.js) - 구글 시트 연동 완료 버전
   ========================================================================== */

// DOM 요소가 모두 로드된 후 실행됩니다.
document.addEventListener('DOMContentLoaded', () => {
    
    // ----------------------------------------------------------------------
    // 🔗 사용자가 제공한 구글 앱스 스크립트 배포 URL이 설정되었습니다.
    // ----------------------------------------------------------------------
    const GOOGLE_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbynbKh0hAzFBp5c0Y9T17cTCiWnSTHnjtEQLfZCkVVN3FDWHVg-nVuL7pg80A5iov_z/exec"; 

    // 메뉴 카드 data-id (영문) ↔ 구글 시트 메뉴 이름 (한글) 매핑 객체
    const menuMap = {
        'bibimbap': '비빔밥',
        'samgyeopsal': '삼겹살',
        'burger': '햄버거',
        'tteokbokki': '떡볶이'
    };

    // 구글 시트 메뉴 이름 (한글) ↔ 메뉴 카드 data-id (영문) 역매핑 객체
    const reverseMenuMap = {
        '비빔밥': 'bibimbap',
        '삼겹살': 'samgyeopsal',
        '햄버거': 'burger',
        '떡볶이': 'tteokbokki'
    };

    // 1. 상태(State) 변수 정의
    const initialVotes = {
        bibimbap: 0,
        samgyeopsal: 0,
        burger: 0,
        tteokbokki: 0
    };

    // 로컬 데이터 초기화 (로컬 스토리지 데이터 사용)
    let votes = JSON.parse(localStorage.getItem('lunch_votes')) || { ...initialVotes };
    let selectedMenuId = null; // 현재 클라이언트가 선택한 메뉴 ID

    // 2. 주요 DOM 요소 참조
    const menuCards = document.querySelectorAll('.menu-card');
    const voteBtn = document.getElementById('voteBtn');
    const resetBtn = document.getElementById('resetBtn');
    const totalVotesEl = document.getElementById('totalVotes');

    // 3. UI 업데이트 함수 (득표 수 및 비율 그래프 시각화)
    function updateResultsUI() {
        // 총 투표수 계산
        const totalVotes = Object.values(votes).reduce((acc, curr) => acc + curr, 0);
        totalVotesEl.textContent = totalVotes.toLocaleString();

        // 4가지 메뉴 각각의 결과 수치와 막대 그래프 업데이트
        Object.keys(votes).forEach(menuId => {
            const count = votes[menuId];
            const percentage = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);

            const resultItem = document.getElementById(`result-${menuId}`);
            if (resultItem) {
                // 득표수 텍스트 표시
                const countEl = resultItem.querySelector('.count');
                if (countEl) countEl.textContent = `${count}표`;

                // 백분율(%) 텍스트 표시
                const percentEl = resultItem.querySelector('.percent');
                if (percentEl) percentEl.textContent = `${percentage}%`;

                // 막대 그래프 너비(width) 변경 애니메이션
                const fillEl = resultItem.querySelector('.progress-bar-fill');
                if (fillEl) fillEl.style.width = `${percentage}%`;
            }
        });
    }

    // 4. 구글 시트에서 최신 투표 데이터 가져오기 (doGet 호스팅)
    async function fetchVotesFromGoogleSheet() {
        if (!GOOGLE_APP_SCRIPT_URL) {
            updateResultsUI();
            return;
        }

        try {
            // 구글 앱스 스크립트 doGet 호출
            const response = await fetch(GOOGLE_APP_SCRIPT_URL, {
                method: 'GET',
                redirect: 'follow' // 구글 앱스 스크립트 리다이렉션 추적
            });

            if (!response.ok) {
                throw new Error(`HTTP 에러 발생: ${response.status}`);
            }

            const data = await response.json();
            console.log("구글 시트 수신 데이터:", data);

            // 받아온 한글 메뉴 데이터를 ID로 변환하여 votes 객체 업데이트
            // data 예시: { "삼겹살": 3, "떡볶이": 1, "햄버거": 0, "비빔밥": 2 }
            Object.keys(data).forEach(menuName => {
                const menuId = reverseMenuMap[menuName.trim()];
                if (menuId) {
                    votes[menuId] = Number(data[menuName]) || 0;
                }
            });

            // 로컬 스토리지에 동기화 및 화면 업데이트
            localStorage.setItem('lunch_votes', JSON.stringify(votes));
            updateResultsUI();
        } catch (error) {
            console.error("구글 시트 데이터 불러오기 실패:", error);
            // 구글 시트 불러오기 실패 시 기존 로컬 데이터로 UI 렌더링 유지
            updateResultsUI();
        }
    }

    // 5. 구글 시트에 투표/리셋 요청 전송하기 (doPost 호스팅)
    async function sendVoteToGoogleSheet(actionType, targetMenuName = "") {
        if (!GOOGLE_APP_SCRIPT_URL) return;

        try {
            // CORS 우회 및 구글 보안 정책 준수를 위한 text/plain 헤더와 redirect: 'follow'
            const payload = JSON.stringify({
                action: actionType,       // 'vote' 또는 'reset'
                menu: targetMenuName       // 예: '삼겹살'
            });

            await fetch(GOOGLE_APP_SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: payload
            });

            // 요청 전송 완료 후 구글 시트의 최신 데이터를 다시 동기화
            await fetchVotesFromGoogleSheet();
        } catch (error) {
            console.error("구글 시트에 데이터 저장 중 오류가 발생했습니다:", error);
        }
    }

    // 6. 메뉴 카드 클릭 이벤트 핸들러 (선택 상태 변경)
    menuCards.forEach(card => {
        card.addEventListener('click', () => {
            const clickedMenuId = card.getAttribute('data-id');

            // 기존 선택 해제 후 새로 클릭한 카드 선택
            menuCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');

            selectedMenuId = clickedMenuId;
            voteBtn.disabled = false; // 투표하기 버튼 활성화
        });
    });

    // 7. '투표하기' 버튼 클릭 이벤트 핸들러
    voteBtn.addEventListener('click', async () => {
        if (!selectedMenuId) return;

        const menuName = menuMap[selectedMenuId];

        // 1) 사용자 경험(UX)을 위해 클라이언트 UI 데이터 먼저 1 증가
        votes[selectedMenuId] += 1;
        localStorage.setItem('lunch_votes', JSON.stringify(votes));
        updateResultsUI();

        // 2) 선택 카드 초기화 및 버튼 비활성화
        menuCards.forEach(c => c.classList.remove('selected'));
        const targetId = selectedMenuId;
        selectedMenuId = null;
        voteBtn.disabled = true;

        // 클릭 버튼 미세 애니메이션
        voteBtn.style.transform = 'scale(0.98)';
        setTimeout(() => { voteBtn.style.transform = ''; }, 150);

        // 3) 구글 시트에 투표 결과 서버 전송
        await sendVoteToGoogleSheet('vote', menuName);
    });

    // 8. '투표 초기화' 버튼 클릭 이벤트 핸들러
    resetBtn.addEventListener('click', async () => {
        if (confirm('구글 시트 및 로컬의 모든 투표 데이터를 초기화하시겠습니까?')) {
            // 로컬 데이터 즉시 초기화
            votes = { ...initialVotes };
            localStorage.removeItem('lunch_votes');
            updateResultsUI();

            menuCards.forEach(c => c.classList.remove('selected'));
            selectedMenuId = null;
            voteBtn.disabled = true;

            // 구글 시트에 리셋 전송
            await sendVoteToGoogleSheet('reset');
        }
    });

    // 9. 앱 시작 시 구글 시트 최신 데이터 가져오기
    updateResultsUI();            // 1) 기본 화면 표시
    fetchVotesFromGoogleSheet();  // 2) 구글 시트 데이터 불러오기
});
