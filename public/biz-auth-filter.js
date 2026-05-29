
(function () {
    // 배포 후 콘솔에서 버전 확인 (카페24 scripttag 캐시 여부 점검용)
    window.__bizAuthFilterVersion = '2026-05-29-file-key-bridge-add1-add2-v9';

    var state = {
        ntsVerified: false,
        duplVerified: false,
        verifiedBizNo: '',
        verifyPending: false,
        verifySeq: 0,
        verifyAbort: null,
        verifyBtnLabel: '',
        verifyMsgObserver: null,
        submissionId: null,
        bizRegDoc: { url: null, key: null, uploaded: false, uploading: false },
        bankCopyDoc: { url: null, key: null, uploaded: false, uploading: false }
    };

    var MAX_FILE_BYTES = 10 * 1024 * 1024;
    var ALLOWED_FILE_EXT = /\.(pdf|jpe?g|png|gif|webp)$/i;

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

    function getUploadSessionId() {
        var key = 'bizpass_upload_session';
        try {
            var id = sessionStorage.getItem(key);
            if (!id) {
                id =
                    'ups_' +
                    Date.now() +
                    '_' +
                    Math.random().toString(36).slice(2, 12);
                sessionStorage.setItem(key, id);
            }
            return id;
        } catch (e) {
            return 'ups_' + Date.now();
        }
    }

    function getMallId() {
        if (typeof window.EC_GLOBAL_MALL_ID !== 'undefined' && window.EC_GLOBAL_MALL_ID) {
            return String(window.EC_GLOBAL_MALL_ID);
        }
        if (typeof window.CAFE24_MALL_ID !== 'undefined' && window.CAFE24_MALL_ID) {
            return String(window.CAFE24_MALL_ID);
        }
        var host = (location.hostname || '').toLowerCase();
        var cafe24 = host.match(/^([a-z0-9_-]+)\.(cafe24|shopcafe24)\./i);
        if (cafe24) return cafe24[1];
        var shop = host.match(/^shop\.([a-z0-9_-]+)\./i);
        if (shop) return shop[1];
        return '';
    }

    function getCurrentBizNo() {
        if (state.verifiedBizNo) return state.verifiedBizNo;
        return getBizNoValue(getBizNoCell());
    }

    // 카페24 추가항목에 랜덤키 주입
    function syncHiddenDocFields() {
        var sessionEl = document.getElementById('bizUploadSessionId');
        if (sessionEl) sessionEl.value = getUploadSessionId();
        var subEl = document.getElementById('bizSubmissionId');
        if (subEl) subEl.value = state.submissionId || '';
        var regUrlEl = document.getElementById('bizBusinessRegUrl');
        if (regUrlEl) regUrlEl.value = state.bizRegDoc.url || '';
        var bankUrlEl = document.getElementById('bizBankCopyUrl');
        if (bankUrlEl) bankUrlEl.value = state.bankCopyDoc.url || '';

        // 카페24 추가항목(add1/add2)에 랜덤키 브릿지
        setCafe24BridgeValue('biz-file-uploads-1', state.bizRegDoc.key || '');
        setCafe24BridgeValue('biz-file-uploads-2', state.bankCopyDoc.key || '');
    }

    function injectHiddenDocFields() {
        var form = findJoinForm();
        if (!form || document.getElementById('bizUploadSessionId')) return;

        function addHidden(id, name) {
            var input = document.createElement('input');
            input.type = 'hidden';
            input.id = id;
            input.name = name;
            form.appendChild(input);
        }

        addHidden('bizUploadSessionId', 'biz_upload_session_id');
        addHidden('bizSubmissionId', 'biz_submission_id');
        addHidden('bizBusinessRegUrl', 'biz_business_reg_url');
        addHidden('bizBankCopyUrl', 'biz_bank_copy_url');
        syncHiddenDocFields();
    }

    function applySubmissionUrls(data) {
        if (!data) return;
        if (data.id) state.submissionId = data.id;
        if (data.business_reg_url) state.bizRegDoc.url = data.business_reg_url;
        if (data.bank_copy_url) state.bankCopyDoc.url = data.bank_copy_url;
        if (data.business_reg_key) state.bizRegDoc.key = data.business_reg_key;
        if (data.bank_copy_key) state.bankCopyDoc.key = data.bank_copy_key;
        if (data.document_type === 'business_reg' && data.public_url) {
            state.bizRegDoc.url = data.public_url;
        }
        if (data.document_type === 'bank_copy' && data.public_url) {
            state.bankCopyDoc.url = data.public_url;
        }
    }

    //
    function buildRandomDocKey(prefix) {
        return (
            prefix +
            '_' +
            Date.now().toString(36) +
            '_' +
            Math.random().toString(36).slice(2, 10)
        );
    }

    // check.html add1/add2 행의 실제 input에 키값 주입
    function setCafe24BridgeValue(rowClassName, value) {
        var row = document.querySelector('tr.' + rowClassName);
        if (!row) return;
        var field = row.querySelector('input, textarea, select');
        if (!field) return;
        field.value = value || '';
        if (typeof field.dispatchEvent === 'function') {
            try {
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (e) {}
        }
    }

    // 사용자 화면에서는 안 보이되, 값은 서버 전송되도록 유지
    function hideCafe24BridgeRows() {
        var rows = document.querySelectorAll(
            'tr.biz-file-uploads-1, tr.biz-file-uploads-2'
        );
        for (var i = 0; i < rows.length; i++) {
            rows[i].setAttribute('aria-hidden', 'true');
            rows[i].style.setProperty('display', 'none', 'important');
        }
    }

    function syncDocumentsBizNo(bizNo) {
        var apiBase = getApiBase();
        var mallId = getMallId();
        if (!apiBase || !mallId || !bizNo) return;

        fetch(apiBase + '/api/biz/documents/biz-no', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                upload_session_id: getUploadSessionId(),
                mall_id: mallId,
                biz_no: bizNo
            }),
            cache: 'no-store'
        }).catch(function () {});
    }

    //
    function uploadDocumentToServer(file, documentType, docStateKey, inputId, emptyLabel) {
        var apiBase = getApiBase();
        var mallId = getMallId();
        var nameEl = document.getElementById(inputId + 'Name');
        var doc = state[docStateKey];

        if (!apiBase || !mallId) {
            alert('파일 업로드 설정을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');
            return Promise.resolve(false);
        }

        var docKey = buildRandomDocKey(
            documentType === 'business_reg' ? 'reg' : 'bank'
        );

        doc.uploading = true;
        doc.uploaded = false;
        doc.url = null;
        doc.key = docKey;
        if (nameEl) {
            nameEl.textContent = '업로드 중…';
            nameEl.classList.add('biz-file-empty');
        }
        updateJoinButton();

        var formData = new FormData();
        formData.append('file', file);
        formData.append('document_type', documentType);
        formData.append('upload_session_id', getUploadSessionId());
        formData.append('mall_id', mallId);
        formData.append('document_key', docKey);
        var bizNo = getCurrentBizNo();
        if (bizNo) formData.append('biz_no', bizNo);

        return fetch(apiBase + '/api/biz/upload', {
            method: 'POST',
            body: formData,
            cache: 'no-store'
        })
            .then(function (res) {
                return res.json().then(function (data) {
                    return { res: res, data: data };
                });
            })
            .then(function (result) {
                doc.uploading = false;
                var data = result.data;
                if (!result.res.ok || !data || !data.ok) {
                    doc.uploaded = false;
                    if (nameEl) {
                        nameEl.textContent =
                            (data && data.message) || '업로드에 실패했습니다.';
                        nameEl.classList.add('biz-file-empty');
                    }
                    updateJoinButton();
                    return false;
                }
                applySubmissionUrls(data);
                doc.url =
                    documentType === 'business_reg'
                        ? state.bizRegDoc.url
                        : state.bankCopyDoc.url;
                doc.key =
                    documentType === 'business_reg'
                        ? state.bizRegDoc.key
                        : state.bankCopyDoc.key;
                doc.uploaded = true;
                if (nameEl) {
                    nameEl.textContent = file.name + ' (업로드 완료)';
                    nameEl.classList.remove('biz-file-empty');
                }
                syncHiddenDocFields();
                updateJoinButton();
                return true;
            })
            .catch(function () {
                doc.uploading = false;
                doc.uploaded = false;
                doc.key = null;
                if (nameEl) {
                    nameEl.textContent = '업로드에 실패했습니다.';
                    nameEl.classList.add('biz-file-empty');
                }
                updateJoinButton();
                return false;
            });
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

    function getBizVerifyMsgEl() {
        return document.getElementById('bizVerifyMsg');
    }

    var INVALID_BIZ_RE = /유효하지\s*않은\s*사업자/;

    function hideInvalidBizWarnNodes() {
        var nodes = document.querySelectorAll('#bizVerifyMsg, .biz-verify-msg, .txtWarn');
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n.id === 'bizVerifyMsg' && n.classList.contains('biz-verify-loading')) continue;
            var t = (n.textContent || '').replace(/\s+/g, ' ').trim();
            if (!INVALID_BIZ_RE.test(t)) continue;
            n.setAttribute('data-biz-hidden-pending', '1');
            n.style.setProperty('display', 'none', 'important');
        }
    }

    function restoreHiddenBizWarnNodes() {
        var hidden = document.querySelectorAll('[data-biz-hidden-pending="1"]');
        for (var i = 0; i < hidden.length; i++) {
            hidden[i].style.removeProperty('display');
            hidden[i].removeAttribute('data-biz-hidden-pending');
        }
    }

    // 확인 중에는 카페24가 넣은 txtWarn(유효하지 않은…) 숨김
    function setBizVerifyPendingUi(pending) {
        document.body.classList.toggle('biz-verify-pending', !!pending);
        var el = getBizVerifyMsgEl();
        if (el) el.setAttribute('data-biz-pending', pending ? '1' : '');
        if (pending) hideInvalidBizWarnNodes();
        else restoreHiddenBizWarnNodes();
    }

    var LOADING_MSG = '국세청에서 확인 중입니다. 잠시만 기다려 주세요.';

    // 사업자 확인 메시지 — true:성공, false:실패, null:로딩(중립), 빈문자:초기화
    function setBizVerifyMsg(text, status) {
        var el = getBizVerifyMsgEl();
        if (!el) return;

        if (status === false && state.verifyPending) return;

        if (status === null) {
            el.className = 'biz-verify-msg gBlank5 biz-verify-loading';
            el.innerHTML =
                '<span class="biz-verify-loading-inner">' +
                '⏳ ' + (text || '국세청에서 확인 중입니다…') +
                '</span>';
            return;
        }

        el.innerHTML = '';
        el.textContent = text || '';
        var cls = 'biz-verify-msg gBlank5';
        if (text) {
            if (status === true) cls += ' txtSuccess';
            else if (status === false) cls += ' txtWarn';
        }
        el.className = cls;
    }

    // 사업자번호 입력란·확인 버튼 로딩 중 비활성
    function setVerifyUiLocked(locked) {
        var btn = document.getElementById('btnBizVerify');
        if (btn) {
            if (locked) {
                var btnText = (btn.textContent || btn.innerText || '').trim();
                if (btnText && btnText !== '확인 중…') {
                    state.verifyBtnLabel = btnText;
                } else if (!state.verifyBtnLabel) {
                    state.verifyBtnLabel = '사업자 확인';
                }
                btn.classList.add('biz-verify-busy');
                btn.setAttribute('disabled', 'disabled');
                btn.setAttribute('aria-busy', 'true');
                btn.textContent = '확인 중…';
            } else {
                btn.classList.remove('biz-verify-busy');
                btn.removeAttribute('disabled');
                btn.removeAttribute('aria-busy');
                if (state.verifyBtnLabel) btn.textContent = state.verifyBtnLabel;
            }
        }

        var cell = getBizNoCell();
        var inputs = getBizNoInputs(cell);
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].disabled = !!locked;
        }
    }

    // 로딩/버튼 스타일 (!important — 카페24 txtWarn 덮어쓰기 방지)
    function injectVerifyStyles() {
        if (document.getElementById('biz-verify-styles')) return;
        var style = document.createElement('style');
        style.id = 'biz-verify-styles';
        style.textContent =
            '#bizVerifyMsg.biz-verify-loading{' +
            'color:#333 !important;background:#f0f4f8 !important;' +
            'border:1px solid #c5d3e0 !important;padding:10px 12px !important;' +
            'border-radius:4px !important;display:block !important;}' +
            '#bizVerifyMsg.biz-verify-loading .biz-verify-loading-inner{' +
            'color:#333 !important;font-weight:normal !important;}' +
            '#bizVerifyMsg.txtWarn.biz-verify-loading,#bizVerifyMsg.txtSuccess.biz-verify-loading{' +
            'color:#333 !important;background:#f0f4f8 !important;}' +
            '#btnBizVerify.biz-verify-busy{opacity:.7 !important;cursor:wait !important;}' +
            '.biz-no-cell input:disabled{background:#f5f5f5 !important;}' +
            'body.biz-verify-pending #bizVerifyMsg.txtWarn:not(.biz-verify-loading),' +
            'body.biz-verify-pending #bizVerifyMsg:not(.biz-verify-loading){' +
            'display:none !important;}' +
            'body.biz-verify-pending .biz-verify-msg.txtWarn:not(.biz-verify-loading){' +
            'display:none !important;}' +
            '.biz-file-uploads{margin:12px 0;}' +
            '.biz-file-row th{vertical-align:middle;}' +
            '.biz-file-row .biz-file-required{color:#0a5ca8;margin-left:4px;font-size:12px;}' +
            '.biz-file-cell{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}' +
            '.biz-file-btn{display:inline-block;padding:8px 14px;border:1px solid #ccc;' +
            'background:#fafafa;border-radius:4px;cursor:pointer;font-size:13px;}' +
            '.biz-file-btn:hover{background:#f0f0f0;}' +
            '.biz-file-name{color:#333;font-size:13px;max-width:100%;word-break:break-all;}' +
            '.biz-file-name.biz-file-empty{color:#999;}' +
            '.biz-file-err{display:block;width:100%;color:#d32f2f;font-size:12px;margin-top:4px;}';
        document.head.appendChild(style);
    }

    function findJoinForm() {
        var joinBtn = document.getElementById('btnMemberJoin');
        if (joinBtn && joinBtn.form) return joinBtn.form;
        return document.querySelector(
            'form#join_form, form#frmJoin, form[name="join_form"], form[action*="member/join"], form[action*="Join"]'
        );
    }

    function ensureMultipartForm() {
        var form = findJoinForm();
        if (!form) return;
        var enc = (form.getAttribute('enctype') || form.enctype || '').toLowerCase();
        if (enc !== 'multipart/form-data') {
            form.setAttribute('enctype', 'multipart/form-data');
            form.enctype = 'multipart/form-data';
        }
    }

    function isAllowedFile(file) {
        if (!file) return false;
        if (file.size > MAX_FILE_BYTES) {
            alert('첨부 파일은 10MB 이하만 가능합니다.');
            return false;
        }
        var name = file.name || '';
        if (!ALLOWED_FILE_EXT.test(name)) {
            alert('PDF 또는 이미지 파일(jpg, png, gif, webp)만 첨부할 수 있습니다.');
            return false;
        }
        return true;
    }

    function bindFileInput(inputId, docStateKey, documentType, emptyLabel) {
        var input = document.getElementById(inputId);
        if (!input) return;

        input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            var doc = state[docStateKey];
            var nameEl = document.getElementById(inputId + 'Name');

            if (!file) {
                doc.url = null;
                doc.key = null;
                doc.uploaded = false;
                doc.uploading = false;
                if (nameEl) {
                    nameEl.textContent = emptyLabel;
                    nameEl.classList.add('biz-file-empty');
                }
                syncHiddenDocFields();
                updateJoinButton();
                return;
            }
            if (!isAllowedFile(file)) {
                input.value = '';
                doc.url = null;
                doc.key = null;
                doc.uploaded = false;
                doc.uploading = false;
                if (nameEl) {
                    nameEl.textContent = emptyLabel;
                    nameEl.classList.add('biz-file-empty');
                }
                syncHiddenDocFields();
                updateJoinButton();
                return;
            }

            uploadDocumentToServer(file, documentType, docStateKey, inputId, emptyLabel);
        });
    }

    function createFileUploadRow(labelText, inputId, buttonText, emptyLabel) {
        var tr = document.createElement('tr');
        tr.className = 'biz-file-row';

        var th = document.createElement('th');
        th.scope = 'row';
        th.innerHTML =
            labelText + '<span class="biz-file-required" aria-hidden="true">*</span>';

        var td = document.createElement('td');
        td.colSpan = 3;
        td.className = 'biz-file-cell-wrap';

        var cell = document.createElement('div');
        cell.className = 'biz-file-cell';

        var input = document.createElement('input');
        input.type = 'file';
        input.id = inputId;
        input.className = 'biz-file-input';
        input.setAttribute('aria-required', 'true');
        input.accept = '.pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/*';
        input.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;';

        var btn = document.createElement('label');
        btn.htmlFor = inputId;
        btn.className = 'biz-file-btn';
        btn.textContent = buttonText;

        var nameSpan = document.createElement('span');
        nameSpan.id = inputId + 'Name';
        nameSpan.className = 'biz-file-name biz-file-empty';
        nameSpan.textContent = emptyLabel;

        cell.appendChild(input);
        cell.appendChild(btn);
        cell.appendChild(nameSpan);
        td.appendChild(cell);
        tr.appendChild(th);
        tr.appendChild(td);
        return tr;
    }

    function createFileUploadBlock() {
        var block = document.createElement('div');
        block.className = 'biz-file-uploads';
        block.id = 'biz-file-uploads';

        function addDivRow(labelText, inputId, buttonText, emptyLabel) {
            var row = document.createElement('div');
            row.className = 'biz-file-row biz-file-row-div gBlank20';

            var label = document.createElement('div');
            label.className = 'biz-file-label';
            label.innerHTML =
                '<strong>' +
                labelText +
                '</strong><span class="biz-file-required">*</span>';

            var cell = document.createElement('div');
            cell.className = 'biz-file-cell';

            var input = document.createElement('input');
            input.type = 'file';
            input.id = inputId;
            input.className = 'biz-file-input';
            input.setAttribute('aria-required', 'true');
            input.accept = '.pdf,.jpg,.jpeg,.png,.gif,.webp,application/pdf,image/*';
            input.style.cssText =
                'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;';

            var btn = document.createElement('label');
            btn.htmlFor = inputId;
            btn.className = 'biz-file-btn';
            btn.textContent = buttonText;

            var nameSpan = document.createElement('span');
            nameSpan.id = inputId + 'Name';
            nameSpan.className = 'biz-file-name biz-file-empty';
            nameSpan.textContent = emptyLabel;

            cell.appendChild(input);
            cell.appendChild(btn);
            cell.appendChild(nameSpan);
            row.appendChild(label);
            row.appendChild(cell);
            block.appendChild(row);
        }

        addDivRow(
            '사업자등록증',
            'bizFileBusinessReg',
            '사업자등록증 파일 첨부',
            '선택된 파일 없음'
        );
        addDivRow(
            '통장 사본',
            'bizFileBankCopy',
            '통장 사본 첨부',
            '선택된 파일 없음'
        );
        return block;
    }

    // 회원가입 폼에 사업자등록증·통장사본 첨부란 주입 (카페24 회원가입항목에 파일형 없음)
    function injectFileUploadFields() {
        if (
            document.getElementById('biz-file-uploads') ||
            document.getElementById('bizFileBusinessReg')
        ) {
            return;
        }

        ensureMultipartForm();

        var inserted = false;
        var cell = getBizNoCell();
        if (cell) {
            var bizTr = cell.closest('tr');
            if (bizTr && bizTr.parentNode) {
                var tbody = bizTr.parentNode;
                var insertRef = bizTr.nextSibling;
                var rowReg = createFileUploadRow(
                    '사업자등록증',
                    'bizFileBusinessReg',
                    '사업자등록증 파일 첨부',
                    '선택된 파일 없음'
                );
                var rowBank = createFileUploadRow(
                    '통장 사본',
                    'bizFileBankCopy',
                    '통장 사본 첨부',
                    '선택된 파일 없음'
                );
                rowReg.id = 'biz-file-uploads';
                tbody.insertBefore(rowBank, insertRef);
                tbody.insertBefore(rowReg, insertRef);
                inserted = true;
            }
        }

        if (!inserted) {
            var joinBtn = document.getElementById('btnMemberJoin');
            var block = createFileUploadBlock();
            var anchor =
                (joinBtn && (joinBtn.closest('.ec-base-table') || joinBtn.closest('table'))) ||
                findJoinForm();
            if (anchor && anchor.parentNode) {
                anchor.parentNode.insertBefore(block, joinBtn || null);
            } else {
                var form = findJoinForm();
                if (form) form.appendChild(block);
            }
        }

        bindFileInput(
            'bizFileBusinessReg',
            'bizRegDoc',
            'business_reg',
            '선택된 파일 없음'
        );
        bindFileInput('bizFileBankCopy', 'bankCopyDoc', 'bank_copy', '선택된 파일 없음');
        injectHiddenDocFields();
    }

    function hasRequiredFiles() {
        return (
            state.bizRegDoc.uploaded &&
            state.bankCopyDoc.uploaded &&
            !state.bizRegDoc.uploading &&
            !state.bankCopyDoc.uploading
        );
    }

    function validateRequiredFiles() {
        if (state.bizRegDoc.uploading || state.bankCopyDoc.uploading) {
            alert('파일 업로드가 진행 중입니다. 잠시만 기다려 주세요.');
            return false;
        }
        if (!state.submissionId) {
            alert('제출 정보가 없습니다. 파일을 다시 첨부해 주세요.');
            return false;
        }
        if (!state.bizRegDoc.uploaded || !state.bizRegDoc.url || !state.bizRegDoc.key) {
            alert('사업자등록증 파일을 첨부해 주세요.');
            var regInput = document.getElementById('bizFileBusinessReg');
            if (regInput) regInput.focus();
            return false;
        }
        if (!state.bankCopyDoc.uploaded || !state.bankCopyDoc.url || !state.bankCopyDoc.key) {
            alert('통장 사본 파일을 첨부해 주세요.');
            var bankInput = document.getElementById('bizFileBankCopy');
            if (bankInput) bankInput.focus();
            return false;
        }
        return true;
    }

    // 카페24 기본 검증이 #bizVerifyMsg에 실패 문구를 덮어쓸 때 로딩으로 되돌림
    function watchBizVerifyMsgWhilePending() {
        var el = getBizVerifyMsgEl();
        if (!el || typeof MutationObserver === 'undefined') return;

        if (state.verifyMsgObserver) {
            state.verifyMsgObserver.disconnect();
            state.verifyMsgObserver = null;
        }
        if (!state.verifyPending) return;

        state.verifyMsgObserver = new MutationObserver(function () {
            if (!state.verifyPending) return;
            hideInvalidBizWarnNodes();
            if (el.classList.contains('biz-verify-loading')) return;
            setBizVerifyMsg(LOADING_MSG, null);
        });
        state.verifyMsgObserver.observe(el, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function stopWatchBizVerifyMsg() {
        if (state.verifyMsgObserver) {
            state.verifyMsgObserver.disconnect();
            state.verifyMsgObserver = null;
        }
        setBizVerifyPendingUi(false);
    }

    // API 응답 후 UI 반영 (늦게 온 응답은 무시)
    function applyVerifyResult(seq, bizNo, data) {
        if (seq !== state.verifySeq) return;

        state.verifyPending = false;
        stopWatchBizVerifyMsg();
        setVerifyUiLocked(false);

        if (data && data.ok) {
            state.ntsVerified = true;
            state.verifiedBizNo = bizNo;
            setBizVerifyMsg(
                '사업자 확인이 완료되었습니다. 중복확인을 진행해 주세요.',
                true
            );
            setDuplBtnVisible(true);
            syncDocumentsBizNo(bizNo);
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
    }

    function applyVerifyError(seq, message) {
        if (seq !== state.verifySeq) return;

        state.verifyPending = false;
        stopWatchBizVerifyMsg();
        setVerifyUiLocked(false);
        state.ntsVerified = false;
        state.verifiedBizNo = '';
        setBizVerifyMsg(message, false);
        setDuplBtnVisible(false);
        updateJoinButton();
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
        var enabled =
            state.ntsVerified && state.duplVerified && hasRequiredFiles();
        if (enabled) btn.classList.remove('biz-join-disabled');
        else btn.classList.add('biz-join-disabled');
    }

    // 검증 상태·UI를 초기값으로 되돌림 (진행 중 API 요청 취소)
    function resetFlow() {
        if (state.verifyPending) {
            if (state.verifyAbort) {
                state.verifyAbort.abort();
                state.verifyAbort = null;
            }
            state.verifySeq += 1;
            state.verifyPending = false;
            stopWatchBizVerifyMsg();
            setVerifyUiLocked(false);
        }
        state.ntsVerified = false;
        state.duplVerified = false;
        state.verifiedBizNo = '';
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

        // 즉시 잠금 — 응답 오기 전 실패 메시지·중복 클릭 방지
        if (state.verifyAbort) state.verifyAbort.abort();
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

            setDuplBtnVisible(false);
        setBizVerifyPendingUi(true);
        setBizVerifyMsg(LOADING_MSG, null);
        setVerifyUiLocked(true);
        watchBizVerifyMsgWhilePending();

        fetch(apiBase + '/api/biz/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ b_no: bizNo }),
            signal: signal,
            cache: 'no-store'
        })
            .then(function (res) {
                return res.json().then(function (data) {
                    return { data: data };
                });
            })
            .then(function (result) {
                applyVerifyResult(seq, bizNo, result.data);
            })
            .catch(function (err) {
                if (seq !== state.verifySeq) return;
                if (err && err.name === 'AbortError') return;
                applyVerifyError(
                    seq,
                    '사업자 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.'
                );
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
        if (!validateRequiredFiles()) {
            return false;
        }
        ensureMultipartForm();
        return true;
    };

    // 사업자번호 input 변경 시 검증 상태 초기화 이벤트 연결
    function bindBizNoInputs() {
        var cell = getBizNoCell();
        var inputs = getBizNoInputs(cell);
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('input', function () {
                if (state.verifyPending) return;
                if (getBizNoValue(cell) !== state.verifiedBizNo) resetFlow();
            });
            inputs[i].addEventListener('change', function () {
                if (state.verifyPending) return;
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
        injectFileUploadFields();
        injectHiddenDocFields();
        hideCafe24BridgeRows();
        setDuplBtnVisible(false);
        updateJoinButton();
        bindBizNoInputs();
        watchDuplMsg();

        var verifyBtn = document.getElementById('btnBizVerify');
        if (verifyBtn) {
            function onVerifyClick(e) {
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                verifyBizNo();
            }
            verifyBtn.addEventListener('click', onVerifyClick, true);
            verifyBtn.addEventListener('mousedown', function (e) {
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            }, true);
        }

        setInterval(syncDuplState, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
