
(function () {
    var state = {
        ntsVerified: false,
        duplVerified: false,
        verifiedBizNo: '',
        verifyPending: false,
        verifySeq: 0,
        verifyAbort: null
    };

    // scripttag src(biz-auth-filter.js) 호스트 → API 베이스 URL (카페24 쇼핑몰 도메인과 다름)
    function getApiBase() {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            if (src.indexOf('biz-auth-filter.js') === -1) continue;
            try {
                return new URL(src).origin;
            } catch (e) {
                return '';
            }
        }
        return '';
    }

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

    // 사업자 확인 메시지 — true:성공, false:실패, null:로딩(중립), 빈문자:초기화
    function setBizVerifyMsg(text, status) {
        var el = document.getElementById('bizVerifyMsg');
        if (!el) return;
        el.textContent = text || '';
        var cls = 'biz-verify-msg gBlank5';
        if (text) {
            if (status === true) cls += ' txtSuccess';
            else if (status === false) cls += ' txtWarn';
            else if (status === null) cls += ' biz-verify-loading';
        }
        el.className = cls;
    }

    // 사업자 확인 버튼 로딩 중 비활성
    function setVerifyBtnBusy(busy) {
        var btn = document.getElementById('btnBizVerify');
        if (!btn) return;
        if (busy) {
            btn.classList.add('biz-verify-busy');
            btn.setAttribute('disabled', 'disabled');
            btn.setAttribute('aria-busy', 'true');
        } else {
            btn.classList.remove('biz-verify-busy');
            btn.removeAttribute('disabled');
            btn.removeAttribute('aria-busy');
        }
    }

    // 로딩/버튼 스타일 (카페24 테마에 없는 클래스용)
    function injectVerifyStyles() {
        if (document.getElementById('biz-verify-styles')) return;
        var style = document.createElement('style');
        style.id = 'biz-verify-styles';
        style.textContent =
            '#bizVerifyMsg.biz-verify-loading{color:#666;}' +
            '#btnBizVerify.biz-verify-busy{opacity:.65;cursor:wait;}';
        document.head.appendChild(style);
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

    // 검증 상태·UI를 초기값으로 되돌림 (진행 중 API 요청 취소)
    function resetFlow() {
        if (state.verifyAbort) {
            state.verifyAbort.abort();
            state.verifyAbort = null;
        }
        state.verifySeq += 1;
        state.verifyPending = false;
        state.ntsVerified = false;
        state.duplVerified = false;
        state.verifiedBizNo = '';
        setVerifyBtnBusy(false);
        setBizVerifyMsg('', undefined);
        setDuplBtnVisible(false);
        var cssnMsg = document.querySelector('.cssn-dupl-msg');
        if (cssnMsg) cssnMsg.innerHTML = '';
        updateJoinButton();
    }

    // 사업자번호 국세청 상태조회(b_stt_cd 01만 통과) 후 중복확인 단계로 진행
    function verifyBizNo() {
        if (state.verifyPending) return;

        var cell = getBizNoCell();
        var bizNo = getBizNoValue(cell);
        if (!bizNo) {
            alert('사업자번호를 입력해 주세요.');
            return;
        }
        if (bizNo.length !== 10) {
            alert('사업자번호 10자리를 입력해 주세요.');
            return;
        }

        var apiBase = getApiBase();
        if (!apiBase) {
            setBizVerifyMsg('사업자 확인 API 주소를 찾을 수 없습니다.', false);
            return;
        }

        if (state.verifyAbort) {
            state.verifyAbort.abort();
        }
        state.verifySeq += 1;
        var seq = state.verifySeq;
        state.verifyAbort =
            typeof AbortController !== 'undefined' ? new AbortController() : null;
        var signal = state.verifyAbort ? state.verifyAbort.signal : undefined;

        state.duplVerified = false;
        state.ntsVerified = false;
        state.verifiedBizNo = '';
        state.verifyPending = true;
        var cssnMsg = document.querySelector('.cssn-dupl-msg');
        if (cssnMsg) cssnMsg.innerHTML = '';

        setVerifyBtnBusy(true);
        setBizVerifyMsg('국세청에서 확인 중입니다…', null);
        setDuplBtnVisible(false);
        updateJoinButton();

        fetch(apiBase + '/api/biz/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ b_no: bizNo }),
            signal: signal
        })
            .then(function (res) {
                return res.json().then(function (data) {
                    return { data: data };
                });
            })
            .then(function (result) {
                if (seq !== state.verifySeq) return;

                state.verifyPending = false;
                setVerifyBtnBusy(false);

                var data = result.data;
                if (data && data.ok) {
                    state.ntsVerified = true;
                    state.verifiedBizNo = bizNo;
                    setBizVerifyMsg(
                        '사업자 확인이 완료되었습니다. 중복확인을 진행해 주세요.',
                        true
                    );
                    setDuplBtnVisible(true);
                } else {
                    state.ntsVerified = false;
                    state.verifiedBizNo = '';
                    setBizVerifyMsg(
                        (data && data.message) || '유효하지 않은 사업자번호입니다.',
                        false
                    );
                    setDuplBtnVisible(false);
                }
                updateJoinButton();
            })
            .catch(function (err) {
                if (seq !== state.verifySeq) return;
                if (err && err.name === 'AbortError') return;

                state.verifyPending = false;
                setVerifyBtnBusy(false);
                state.ntsVerified = false;
                state.verifiedBizNo = '';
                setBizVerifyMsg(
                    '사업자 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.',
                    false
                );
                setDuplBtnVisible(false);
                updateJoinButton();
            });
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
        if (state.verifyPending) return;
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
        if (state.verifyPending) {
            alert('사업자 확인이 진행 중입니다. 잠시만 기다려 주세요.');
            return false;
        }
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
        injectVerifyStyles();
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
