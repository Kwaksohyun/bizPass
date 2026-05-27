
(function () {
    var MOCK_PASS_BIZ_NO = '1234512345';
    var state = { ntsVerified: false, duplVerified: false, verifiedBizNo: '' };

    // 사업자번호 입력 영역(.biz-no-cell) DOM 요소를 반환
    function getBizNoCell() {
        return document.querySelector('.biz-no-cell');
    }

    // 사업자번호 입력란 input 목록을 반환
    function getBizNoInputs(cell) {
        if (!cell) return [];
        return cell.querySelectorAll('input');
    }

    // 분리된 input 값을 합쳐 숫자만 있는 사업자번호 문자열로 반환
    function getBizNoValue(cell) {
        var inputs = getBizNoInputs(cell);
        if (!inputs.length) return '';
        var parts = [];
        for (var i = 0; i < inputs.length; i++) {
            parts.push(String(inputs[i].value || '').replace(/\D/g, ''));
        }
        return parts.join('');
    }

    // 사업자 확인 결과 메시지(#bizVerifyMsg) 문구·스타일 갱신
    function setBizVerifyMsg(text, isOk) {
        var el = document.getElementById('bizVerifyMsg');
        if (!el) return;
        el.textContent = text;
        el.className = 'biz-verify-msg gBlank5' + (text ? (isOk ? ' txtSuccess' : ' txtWarn') : '');
    }

    // 중복확인 버튼(#btnCssnDupl) 표시/숨김
    function setDuplBtnVisible(show) {
        var btn = document.getElementById('btnCssnDupl');
        if (!btn) return;
        if (show) btn.classList.remove('displaynone');
        else btn.classList.add('displaynone');
    }

    // NTS·중복확인 완료 여부에 따라 회원가입 버튼 활성/비활성
    function updateJoinButton() {
        var btn = document.getElementById('btnMemberJoin');
        if (!btn) return;
        var enabled = state.ntsVerified && state.duplVerified;
        if (enabled) btn.classList.remove('biz-join-disabled');
        else btn.classList.add('biz-join-disabled');
    }

    // 검증 상태·UI를 초기값으로 되돌림
    function resetFlow() {
        state.ntsVerified = false;
        state.duplVerified = false;
        state.verifiedBizNo = '';
        setBizVerifyMsg('', false);
        setDuplBtnVisible(false);
        var cssnMsg = document.querySelector('.cssn-dupl-msg');
        if (cssnMsg) cssnMsg.innerHTML = '';
        updateJoinButton();
    }

    // 사업자번호 NTS 확인(목업) 후 중복확인 단계로 진행
    function verifyBizNo() {
        var cell = getBizNoCell();
        var bizNo = getBizNoValue(cell);
        if (!bizNo) {
            alert('사업자번호를 입력해 주세요.');
            return;
        }

        state.duplVerified = false;
        var cssnMsg = document.querySelector('.cssn-dupl-msg');
        if (cssnMsg) cssnMsg.innerHTML = '';

        if (bizNo === MOCK_PASS_BIZ_NO) {
            state.ntsVerified = true;
            state.verifiedBizNo = bizNo;
            setBizVerifyMsg('사업자 확인이 완료되었습니다. 중복확인을 진행해 주세요.', true);
            setDuplBtnVisible(true);
        } else {
            state.ntsVerified = false;
            state.verifiedBizNo = '';
            setBizVerifyMsg('유효하지 않은 사업자번호입니다.', false);
            setDuplBtnVisible(false);
        }
        updateJoinButton();
    }

    // 중복확인 메시지/DOM·전역 플래그로 성공 여부 판별
    function isDuplCheckSuccess(msgEl) {
        if (!msgEl) return false;
        if (typeof window.bCheckDuplCssn !== 'undefined' && window.bCheckDuplCssn === true) return true;
        if (typeof window.bDuplCssn !== 'undefined' && window.bDuplCssn === true) return true;

        var text = (msgEl.textContent || msgEl.innerText || '').replace(/\s+/g, ' ').trim();
        if (!text) return false;

        if (msgEl.classList && msgEl.classList.contains('txtSuccess')) return true;
        if (msgEl.querySelector && msgEl.querySelector('.txtSuccess')) return true;

        if (/사용\s*가능|등록\s*가능|중복되지\s*않|확인되었습니다|확인\s*완료/.test(text)) return true;
        if (/이미\s*(가입|등록|사용)|사용할\s*수\s*없|중복된|불가/.test(text)) return false;

        return false;
    }

    // 중복확인 결과를 state에 반영하고 가입 버튼 상태 갱신
    function syncDuplState() {
        if (!state.ntsVerified) return;
        var cell = getBizNoCell();
        if (getBizNoValue(cell) !== state.verifiedBizNo) {
            resetFlow();
            return;
        }
        var msgEl = document.querySelector('.cssn-dupl-msg');
        state.duplVerified = isDuplCheckSuccess(msgEl);
        updateJoinButton();
    }

    // 회원가입 submit 전 NTS·중복확인 완료 여부 검사(가드)
    window.bizJoinGuard = function () {
        if (!state.ntsVerified) {
            alert('사업자 확인을 먼저 진행해 주세요.');
            return false;
        }
        if (!state.duplVerified) {
            alert('사업자번호 중복확인을 진행해 주세요.');
            return false;
        }
        return true;
    };

    // 사업자번호 input 변경 시 검증 상태 초기화 이벤트 연결
    function bindBizNoInputs() {
        var cell = getBizNoCell();
        var inputs = getBizNoInputs(cell);
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('input', function () {
                if (getBizNoValue(cell) !== state.verifiedBizNo) resetFlow();
            });
            inputs[i].addEventListener('change', function () {
                if (getBizNoValue(cell) !== state.verifiedBizNo) resetFlow();
            });
        }
    }

    // 중복확인 메시지 영역 DOM 변경 감시
    function watchDuplMsg() {
        var msgEl = document.querySelector('.cssn-dupl-msg');
        if (!msgEl || typeof MutationObserver === 'undefined') return;
        new MutationObserver(syncDuplState).observe(msgEl, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    // 페이지 로드 시 UI·이벤트·폴링 초기화
    function init() {
        setDuplBtnVisible(false);
        updateJoinButton();
        bindBizNoInputs();
        watchDuplMsg();

        var verifyBtn = document.getElementById('btnBizVerify');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', function (e) {
                e.preventDefault();
                verifyBizNo();
            });
        }

        setInterval(syncDuplState, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
