(function () {
    'use strict';

    const STORAGE_KEY = 'philo_posts';
    const THEME_KEY = 'philo_theme';
    const FIRESTORE_COLLECTION = 'posts';
    const FIRESTORE_USERS_COLLECTION = 'users';
    const PROFILE_ICON_OPTIONS = ['👤', '👨', '👩', '🧑', '🎭', '🦊', '🐱', '🐶', '🌟', '✨', '🎨', '📚', '🌸', '🍀'];

    var db = null;
    var auth = null;
    if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined' &&
        firebaseConfig.apiKey && firebaseConfig.apiKey.indexOf('ここに') === -1) {
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            auth = firebase.auth();
        } catch (e) {
            db = null;
            auth = null;
        }
    }

    function isLoggedIn() {
        if (!auth) return false;
        return !!auth.currentUser;
    }

    function showLoginModal() {
        var overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.hidden = false;
            overlay.style.display = 'block';
            document.getElementById('auth-error').hidden = true;
            document.body.style.overflow = 'hidden';
        }
    }

    function closeLoginModal() {
        var overlay = document.getElementById('auth-overlay');
        if (overlay) {
            overlay.hidden = true;
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    function getDisplayName(user) {
        if (!user) return 'ログイン中';
        var name = (user.displayName || '').trim();
        if (name) return name;
        return user.email || 'ログイン中';
    }

    function updateAuthUI() {
        var loginBtn = document.getElementById('login-btn');
        var authUser = document.getElementById('auth-user');
        var displayNameEl = document.getElementById('profile-display-name');
        var postTrigger = document.getElementById('post-trigger');
        var profileDropdown = document.getElementById('profile-dropdown');
        if (!loginBtn || !authUser) return;
        if (profileDropdown) profileDropdown.hidden = true;
        var trigger = document.getElementById('profile-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (isLoggedIn()) {
            loginBtn.hidden = true;
            loginBtn.removeAttribute('hidden');
            authUser.hidden = false;
            authUser.removeAttribute('hidden');
            authUser.style.display = '';
            if (displayNameEl) displayNameEl.textContent = getDisplayName(auth ? auth.currentUser : null);
            if (postTrigger) postTrigger.style.visibility = '';
        } else {
            loginBtn.hidden = false;
            loginBtn.removeAttribute('hidden');
            authUser.hidden = true;
            authUser.setAttribute('hidden', '');
            authUser.style.display = 'none';
            if (postTrigger) postTrigger.style.visibility = '';
        }
    }

    function closeProfileDropdown() {
        var dropdown = document.getElementById('profile-dropdown');
        var trigger = document.getElementById('profile-trigger');
        if (dropdown) dropdown.hidden = true;
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    function toggleProfileDropdown() {
        var dropdown = document.getElementById('profile-dropdown');
        var trigger = document.getElementById('profile-trigger');
        if (!dropdown || !trigger) return;
        var isOpen = !dropdown.hidden;
        dropdown.hidden = isOpen;
        trigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    }

    function _uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    function _now() {
        return new Date().toISOString();
    }

    function normalizeThought(t) {
        return {
            id: t.id || _uid(),
            title: t.title || '',
            content: t.content || '',
            tags: Array.isArray(t.tags) ? t.tags : [],
            createdAt: t.createdAt || _now(),
            updatedAt: t.updatedAt || t.createdAt || _now(),
            likes: typeof t.likes === 'number' ? t.likes : 0,
            likedBy: Array.isArray(t.likedBy) ? t.likedBy : [],
            authorId: t.authorId || '',
            authorDisplayName: t.authorDisplayName || '',
            authorIcon: t.authorIcon || '👤'
        };
    }

    function isLikedByMe(thought) {
        if (!auth || !auth.currentUser || !thought.likedBy) return false;
        return thought.likedBy.indexOf(auth.currentUser.uid) >= 0;
    }

    function getLikeIconSrc(liked) {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) return liked ? 'images/テーマ黒用いいね済み.png' : 'images/黒色いいね通常時.png';
        return liked ? 'images/テーマ白用いいね済み.png' : 'images/白色いいね通常時.png';
    }

    let raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    let thoughts = Array.isArray(raw) && raw.length > 0 ? raw : [
        { id: _uid(), title: "変化の唯一性", content: "この世で唯一変化しないものは、<b>変化し続ける</b>ということだけである。", tags: ["変化", "存在"], createdAt: _now(), updatedAt: _now() },
        { id: _uid(), title: "美しさと主観", content: "美しさは物自体にあるのではなく、<font size='5'>それを見る人の心</font>の中にある。", tags: ["美", "主観"], createdAt: _now(), updatedAt: _now() }
    ];
    thoughts = thoughts.map(normalizeThought);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thoughts));

    const feed = document.getElementById('feed');
    const emptyState = document.getElementById('empty-state');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalBody = document.getElementById('modal-body');
    const viewFeed = document.getElementById('view-feed');
    const viewEditor = document.getElementById('view-editor');
    const viewProfile = document.getElementById('view-profile');
    const filterSort = document.getElementById('filter-sort');
    const searchInput = document.getElementById('search-input');
    const filterTag = document.getElementById('filter-tag');
    const searchHint = document.getElementById('search-hint');
    const toastEl = document.getElementById('toast');

    let editingId = null;
    let currentDetailId = null;
    let searchTimeout = null;

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(thoughts));
        if (db) {
            var col = db.collection(FIRESTORE_COLLECTION);
            thoughts.forEach(function (t) {
                col.doc(t.id).set(t).catch(function (err) {
                    console.warn('Firestore save failed:', err);
                });
            });
        }
    }

    function loadFromFirestore() {
        if (!db) return Promise.resolve([]);
        return db.collection(FIRESTORE_COLLECTION).get().then(function (snap) {
            var list = [];
            snap.forEach(function (doc) {
                var d = doc.data();
                list.push(normalizeThought({
                    id: doc.id,
                    title: d.title,
                    content: d.content,
                    tags: d.tags,
                    createdAt: d.createdAt,
                    updatedAt: d.updatedAt,
                    likes: d.likes,
                    likedBy: d.likedBy,
                    authorId: d.authorId,
                    authorDisplayName: d.authorDisplayName,
                    authorIcon: d.authorIcon
                }));
            });
            return list;
        });
    }

    function loadUserProfile(uid) {
        if (!db || !uid) return Promise.resolve({ icon: '👤' });
        return db.collection(FIRESTORE_USERS_COLLECTION).doc(uid).get()
            .then(function (doc) {
                var d = doc.data();
                return { icon: (d && d.icon) || '👤' };
            })
            .catch(function () { return { icon: '👤' }; });
    }

    function saveUserProfile(uid, data) {
        if (!db || !uid) return Promise.resolve();
        return db.collection(FIRESTORE_USERS_COLLECTION).doc(uid).set(data, { merge: true });
    }

    var editorState = { size: 'normal', font: 'sans', color: null };

    var SIZE_MAP = { small: '0.875rem', normal: '1rem', large: '1.25rem', xlarge: '1.5rem' };
    var FONT_MAP = { sans: 'Noto Sans JP, sans-serif', serif: 'Noto Serif JP, serif' };

    function getEditorSelection() {
        var el = document.getElementById('post-content');
        if (!el) return null;
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        var range = sel.getRangeAt(0);
        try {
            if (!el.contains(range.commonAncestorContainer) && !el.contains(range.startContainer)) return null;
        } catch (err) {
            return null;
        }
        return { selection: sel, range: range, editor: el };
    }

    function focusEditor() {
        var el = document.getElementById('post-content');
        if (el) el.focus();
    }

    function insertFormatSpan() {
        var editor = document.getElementById('post-content');
        if (!editor) return;
        var scrollTop = editor.scrollTop;
        editor.focus();

        var ctx = getEditorSelection();
        if (!ctx) {
            var sel = window.getSelection();
            var range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            ctx = { selection: sel, range: range, editor: editor };
        }

        var s = editorState;
        var span = document.createElement('span');
        span.setAttribute('data-fmt', '1');
        span.style.fontSize = SIZE_MAP[s.size] || SIZE_MAP.normal;
        span.style.fontFamily = FONT_MAP[s.font] || FONT_MAP.sans;
        if (s.color) span.style.color = s.color;

        var range = ctx.range;
        try {
            if (range.collapsed) {
                span.appendChild(document.createTextNode('\u200B'));
                range.insertNode(span);
                range.setStart(span.firstChild, 1);
                range.setEnd(span.firstChild, 1);
                ctx.selection.removeAllRanges();
                ctx.selection.addRange(range);
            } else {
                try {
                    range.surroundContents(span);
                } catch (surroundErr) {
                    var frag = range.extractContents();
                    span.appendChild(frag);
                    range.insertNode(span);
                }
                range.setStartAfter(span);
                range.collapse(true);
                ctx.selection.removeAllRanges();
                ctx.selection.addRange(range);
            }
        } catch (e) {
            span.appendChild(document.createTextNode('\u200B'));
            range.insertNode(span);
            range.setStart(span.firstChild, 1);
            range.setEnd(span.firstChild, 1);
            ctx.selection.removeAllRanges();
            ctx.selection.addRange(range);
        }
        focusEditor();
        requestAnimationFrame(function () {
            editor.scrollTop = scrollTop;
        });
    }

    function formatDoc(cmd, value) {
        var el = document.getElementById('post-content');
        if (el) el.focus();
        document.execCommand(cmd, false, value);
    }

    function updateToolbarState() {
        var editor = document.getElementById('post-content');
        if (!editor || !document.body.contains(editor)) return;
        var inEditor = false;
        try {
            var sel = window.getSelection();
            if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) inEditor = true;
        } catch (e) {}
        if (!inEditor) return;

        var fmtBtns = document.querySelectorAll('.tool-format[data-cmd]');
        fmtBtns.forEach(function (btn) {
            var cmd = btn.getAttribute('data-cmd');
            try {
                var on = document.queryCommandState(cmd);
                if (on) btn.classList.add('active'); else btn.classList.remove('active');
            } catch (e) {
                btn.classList.remove('active');
            }
        });

        var align = getBlockAlignment(editor);
        document.querySelectorAll('.tool-align').forEach(function (btn) {
            if (btn.getAttribute('data-align') === align) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    function getBlockAlignment(editor) {
        try {
            var sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return 'left';
            var node = sel.anchorNode;
            if (!node || !editor.contains(node)) return 'left';
            var el = node.nodeType === 3 ? node.parentElement : node;
            while (el) {
                if (el.nodeType === 1) {
                    var a = (el.style && el.style.textAlign) || window.getComputedStyle(el).textAlign;
                    if (a && a !== 'start') {
                        a = String(a).toLowerCase();
                        if (a === 'left' || a === 'center' || a === 'right') return a;
                    }
                }
                if (el === editor) break;
                el = el.parentElement;
            }
        } catch (e) {}
        return 'left';
    }

    function applyToolbarFormat(kind, value) {
        if (kind === 'size') editorState.size = value;
        if (kind === 'font') editorState.font = value;
        if (kind === 'color') editorState.color = value || null;
        insertFormatSpan();
    }

    function initRichEditor() {
        var editor = document.getElementById('post-content');
        if (!editor) return;

        document.querySelectorAll('.tool-format').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                editor.focus();
                var cmd = btn.getAttribute('data-cmd');
                if (cmd) document.execCommand(cmd, false, null);
                updateToolbarState();
            });
        });

        document.querySelectorAll('.tool-align').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                editor.focus();
                var align = btn.getAttribute('data-align');
                if (align === 'left') document.execCommand('justifyLeft', false, null);
                else if (align === 'center') document.execCommand('justifyCenter', false, null);
                else if (align === 'right') document.execCommand('justifyRight', false, null);
                updateToolbarState();
            });
        });

        var sizeBtns = document.querySelectorAll('.tool-size');
        sizeBtns.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                sizeBtns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                applyToolbarFormat('size', btn.getAttribute('data-size'));
            });
        });

        var fontSelect = document.getElementById('tool-font');
        if (fontSelect) {
            fontSelect.addEventListener('change', function (e) {
                e.preventDefault();
                editorState.font = fontSelect.value;
                applyToolbarFormat('font', editorState.font);
            });
        }

        var colorBtns = document.querySelectorAll('.tool-color');
        colorBtns.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                colorBtns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                applyToolbarFormat('color', btn.getAttribute('data-color'));
            });
        });

        editor.addEventListener('focus', updateToolbarState);
        editor.addEventListener('keyup', updateToolbarState);
        editor.addEventListener('mouseup', updateToolbarState);
        document.addEventListener('selectionchange', function () {
            var sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return;
            var node = sel.anchorNode;
            if (node && editor.contains(node)) updateToolbarState();
        });
    }

    function showToast(message) {
        toastEl.textContent = message;
        toastEl.classList.add('is-visible');
        clearTimeout(toastEl._t);
        toastEl._t = setTimeout(function () {
            toastEl.classList.remove('is-visible');
        }, 2500);
    }

    function formatDate(iso) {
        const d = new Date(iso);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return y + '/' + m + '/' + day + ' ' + h + ':' + min;
    }

    function getAllTags() {
        const set = new Set();
        thoughts.forEach(function (t) {
            (t.tags || []).forEach(function (tag) {
                if (tag && tag.trim()) set.add(tag.trim());
            });
        });
        return Array.from(set).sort();
    }

    function getFilteredThoughts() {
        const q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
        const tagVal = (filterTag && filterTag.value) ? filterTag.value : '';
        const sortOrder = (filterSort && filterSort.value) ? filterSort.value : 'newest';
        let list = thoughts.slice();

        if (tagVal) {
            list = list.filter(function (t) {
                return (t.tags || []).some(function (tag) { return tag === tagVal; });
            });
        }
        if (q) {
            list = list.filter(function (t) {
                const plain = (t.content || '').replace(/<[^>]*>?/gm, '');
                const title = (t.title || '').toLowerCase();
                const tagsStr = (t.tags || []).join(' ').toLowerCase();
                return title.includes(q) || plain.toLowerCase().includes(q) || tagsStr.includes(q);
            });
        }
        if (sortOrder === 'popular') {
            list.sort(function (a, b) {
                var la = typeof a.likes === 'number' ? a.likes : 0;
                var lb = typeof b.likes === 'number' ? b.likes : 0;
                if (lb !== la) return lb - la;
                return (b.updatedAt || '') > (a.updatedAt || '') ? 1 : -1;
            });
        } else {
            var key = sortOrder === 'oldest' ? 'createdAt' : 'updatedAt';
            list.sort(function (a, b) {
                var ta = a[key] || '';
                var tb = b[key] || '';
                if (sortOrder === 'oldest') return ta < tb ? -1 : ta > tb ? 1 : 0;
                return ta > tb ? -1 : ta < tb ? 1 : 0;
            });
        }
        return list;
    }

    function renderTagFilter() {
        if (!filterTag) return;
        const current = filterTag.value;
        filterTag.innerHTML = '<option value="">すべてのタグ</option>';
        getAllTags().forEach(function (tag) {
            const opt = document.createElement('option');
            opt.value = tag;
            opt.textContent = tag;
            if (tag === current) opt.selected = true;
            filterTag.appendChild(opt);
        });
    }

    function renderFeed() {
        const list = getFilteredThoughts();
        const cards = feed.querySelectorAll('.card');
        cards.forEach(function (c) { c.remove(); });

        if (list.length === 0) {
            emptyState.hidden = false;
            searchHint.textContent = (searchInput && searchInput.value.trim()) || (filterTag && filterTag.value)
                ? '該当する哲学はありません。'
                : '';
            return;
        }
        emptyState.hidden = true;
        searchHint.textContent = list.length + ' 件';

        list.forEach(function (thought, index) {
            const plainText = (thought.content || '').replace(/<[^>]*>?/gm, '');
            const likes = typeof thought.likes === 'number' ? thought.likes : 0;
            const liked = isLikedByMe(thought);
            const likeImgSrc = getLikeIconSrc(liked);
            const authorName = thought.authorDisplayName || '匿名';
            const authorIcon = thought.authorIcon || '👤';
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.id = thought.id;
            card.innerHTML =
                '<div class="card-author">' +
                '<span class="card-author-icon" aria-hidden="true">' + _escape(authorIcon) + '</span>' +
                '<span class="card-author-name">' + _escape(authorName) + '</span>' +
                '</div>' +
                '<h3>' + _escape(thought.title) + '</h3>' +
                '<div class="preview">' + _escape(plainText) + '</div>' +
                '<div class="meta">' +
                (thought.tags && thought.tags.length
                    ? thought.tags.map(function (t) { return '<span class="tag">' + _escape(t) + '</span>'; }).join('')
                    : '') +
                '<span class="date">' + _escape(formatDate(thought.updatedAt || thought.createdAt)) + '</span>' +
                '<button type="button" class="like-btn" data-id="' + _escape(thought.id) + '" title="高評価">' +
                '<img class="like-icon" src="' + _escape(likeImgSrc) + '" alt=""> <span class="like-count">' + likes + '</span>' +
                '</button>' +
                '</div>';
            card.onclick = function (e) {
                if (e.target.closest('.like-btn')) return;
                showDetail(thought.id);
            };
            var likeBtn = card.querySelector('.like-btn');
            if (likeBtn) {
                likeBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    incrementLike(thought.id);
                });
            }
            feed.appendChild(card);
        });
    }

    function _escape(s) {
        const div = document.createElement('div');
        div.textContent = s == null ? '' : s;
        return div.innerHTML;
    }

    function incrementLike(id) {
        if (!isLoggedIn()) {
            showToast('ログインすると高評価できます');
            showLoginModal();
            return;
        }
        const item = thoughts.find(function (t) { return t.id === id; });
        if (!item) return;
        if (!Array.isArray(item.likedBy)) item.likedBy = [];
        var uid = auth.currentUser.uid;
        if (item.likedBy.indexOf(uid) < 0) {
            item.likedBy.push(uid);
            item.likes = (typeof item.likes === 'number' ? item.likes : 0) + 1;
        }
        save();
        renderFeed();
        if (modalOverlay.classList.contains('is-open') && currentDetailId === id) {
            showDetail(id);
        }
        showToast('高評価しました');
    }

    function showDetail(id) {
        const item = thoughts.find(function (t) { return t.id === id; });
        if (!item) return;
        currentDetailId = id;
        const likes = typeof item.likes === 'number' ? item.likes : 0;
        var showActions = isLoggedIn();
        var actionsHtml = showActions
            ? '<div class="detail-actions">' +
              '<button type="button" class="btn btn--outline" data-action="edit" data-id="' + _escape(item.id) + '">編集</button>' +
              '<button type="button" class="btn danger" data-action="delete" data-id="' + _escape(item.id) + '">削除</button>' +
              '</div>'
            : '';
        var detailAuthorName = item.authorDisplayName || '匿名';
        var detailAuthorIcon = item.authorIcon || '👤';
        var detailLiked = isLikedByMe(item);
        var detailLikeImgSrc = getLikeIconSrc(detailLiked);
        modalBody.innerHTML =
            '<article class="detail-card">' +
            '<div class="detail-author">' +
            '<span class="detail-author-icon" aria-hidden="true">' + _escape(detailAuthorIcon) + '</span>' +
            '<span class="detail-author-name">' + _escape(detailAuthorName) + '</span>' +
            '</div>' +
            '<h2 class="detail-title">' + _escape(item.title) + '</h2>' +
            '<div class="detail-meta-line">' +
            '<time class="detail-date" datetime="' + _escape(item.updatedAt || item.createdAt) + '">' + _escape(formatDate(item.updatedAt || item.createdAt)) + '</time>' +
            (item.tags && item.tags.length
                ? '<div class="detail-tags">' + item.tags.map(function (t) { return '<span class="tag">' + _escape(t) + '</span>'; }).join('') + '</div>'
                : '') +
            '</div>' +
            '<div class="detail-content">' + (item.content || '') + '</div>' +
            '<div class="detail-footer">' +
            '<button type="button" class="btn detail-like-btn" data-action="like" data-id="' + _escape(item.id) + '" title="高評価">' +
            '<img class="like-icon" src="' + _escape(detailLikeImgSrc) + '" alt=""><span class="detail-like-count">' + likes + '</span>' +
            '</button>' +
            actionsHtml +
            '</div>' +
            '</article>';
        modalOverlay.classList.add('is-open');
        modalOverlay.style.display = 'block';
        document.body.style.overflow = 'hidden';

        modalBody.querySelector('[data-action="like"]').onclick = function () {
            incrementLike(item.id);
        };
        if (showActions) {
            modalBody.querySelector('[data-action="edit"]').onclick = function () {
                openPostModal(item.id);
                closeModal(modalOverlay);
            };
            modalBody.querySelector('[data-action="delete"]').onclick = function () {
                deletePost(item.id);
                closeModal(modalOverlay);
                renderFeed();
                renderTagFilter();
                showToast('削除しました');
            };
        }
    }

    function closeModal(overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        currentDetailId = null;
    }

    function closeEditorView() {
        if (viewEditor) viewEditor.hidden = true;
        if (viewFeed) viewFeed.hidden = false;
        document.body.style.overflow = '';
    }

    function getMyPosts() {
        if (!auth || !auth.currentUser) return [];
        var uid = auth.currentUser.uid;
        return thoughts.filter(function (t) { return t.authorId === uid; })
            .sort(function (a, b) { return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''); });
    }

    function renderProfilePage(profile) {
        profile = profile || { icon: '👤' };
        var avatarEl = document.getElementById('profile-page-avatar');
        var nameEl = document.getElementById('profile-page-name');
        var followersEl = document.getElementById('profile-followers-count');
        var followingEl = document.getElementById('profile-following-count');
        var listEl = document.getElementById('profile-posts-list');
        var emptyEl = document.getElementById('profile-posts-empty');
        if (!nameEl || !listEl) return;
        var user = auth && auth.currentUser ? auth.currentUser : null;
        var displayName = user ? getDisplayName(user) : 'ログイン中';
        if (avatarEl) avatarEl.textContent = profile.icon || '👤';
        nameEl.textContent = displayName;
        if (followersEl) followersEl.textContent = '0';
        if (followingEl) followingEl.textContent = '0';
        var myPosts = getMyPosts();
        listEl.innerHTML = '';
        if (myPosts.length === 0) {
            if (emptyEl) { emptyEl.hidden = false; }
        } else {
            if (emptyEl) emptyEl.hidden = true;
            myPosts.forEach(function (thought) {
                var plainText = (thought.content || '').replace(/<[^>]*>?/gm, '');
                var likes = typeof thought.likes === 'number' ? thought.likes : 0;
                var liked = isLikedByMe(thought);
                var likeImgSrc = getLikeIconSrc(liked);
                var authorName = thought.authorDisplayName || '匿名';
                var authorIcon = thought.authorIcon || '👤';
                var card = document.createElement('div');
                card.className = 'card profile-page-card-item';
                card.dataset.id = thought.id;
                card.innerHTML =
                    '<div class="card-author">' +
                    '<span class="card-author-icon" aria-hidden="true">' + _escape(authorIcon) + '</span>' +
                    '<span class="card-author-name">' + _escape(authorName) + '</span>' +
                    '</div>' +
                    '<h3>' + _escape(thought.title) + '</h3>' +
                    '<div class="preview">' + _escape(plainText) + '</div>' +
                    '<div class="meta">' +
                    (thought.tags && thought.tags.length
                        ? thought.tags.map(function (t) { return '<span class="tag">' + _escape(t) + '</span>'; }).join('')
                        : '') +
                    '<span class="date">' + _escape(formatDate(thought.updatedAt || thought.createdAt)) + '</span>' +
                    '<button type="button" class="like-btn" data-id="' + _escape(thought.id) + '" title="高評価">' +
                    '<img class="like-icon" src="' + _escape(likeImgSrc) + '" alt=""> <span class="like-count">' + likes + '</span>' +
                    '</button>' +
                    '</div>';
                card.onclick = function (e) {
                    if (e.target.closest('.like-btn')) return;
                    showDetail(thought.id);
                };
                var likeBtn = card.querySelector('.like-btn');
                if (likeBtn) {
                    likeBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        incrementLike(thought.id);
                    });
                }
                listEl.appendChild(card);
            });
        }
    }

    function openProfileView() {
        if (!isLoggedIn()) return;
        var uid = auth.currentUser.uid;
        loadUserProfile(uid).then(function (profile) {
            renderProfilePage(profile);
        });
        if (viewFeed) viewFeed.hidden = true;
        if (viewEditor) viewEditor.hidden = true;
        if (viewProfile) {
            viewProfile.hidden = false;
            viewProfile.style.display = 'flex';
        }
        document.body.style.overflow = '';
    }

    function openProfileSettingsModal() {
        if (!auth || !auth.currentUser) return;
        var overlay = document.getElementById('profile-settings-overlay');
        var nameInput = document.getElementById('profile-settings-display-name');
        var pickerEl = document.getElementById('profile-icon-picker');
        var errorEl = document.getElementById('profile-settings-error');
        if (!overlay || !nameInput || !pickerEl) return;
        nameInput.value = getDisplayName(auth.currentUser);
        if (errorEl) errorEl.hidden = true;
        pickerEl.innerHTML = '';
        var uid = auth.currentUser.uid;
        loadUserProfile(uid).then(function (profile) {
            var currentIcon = profile.icon || '👤';
            PROFILE_ICON_OPTIONS.forEach(function (emoji) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'profile-icon-option' + (emoji === currentIcon ? ' selected' : '');
                btn.textContent = emoji;
                btn.setAttribute('data-icon', emoji);
                btn.addEventListener('click', function () {
                    pickerEl.querySelectorAll('.profile-icon-option').forEach(function (b) { b.classList.remove('selected'); });
                    btn.classList.add('selected');
                });
                pickerEl.appendChild(btn);
            });
        });
        overlay.hidden = false;
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closeProfileSettingsModal() {
        var overlay = document.getElementById('profile-settings-overlay');
        if (overlay) {
            overlay.hidden = true;
            overlay.style.display = 'none';
        }
        document.body.style.overflow = '';
    }

    function saveProfileSettings() {
        if (!auth || !auth.currentUser) return;
        var nameInput = document.getElementById('profile-settings-display-name');
        var pickerEl = document.getElementById('profile-icon-picker');
        var errorEl = document.getElementById('profile-settings-error');
        var displayName = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
        var selectedBtn = pickerEl && pickerEl.querySelector('.profile-icon-option.selected');
        var icon = selectedBtn ? selectedBtn.getAttribute('data-icon') : '👤';
        if (errorEl) errorEl.hidden = true;
        var uid = auth.currentUser.uid;
        var p = Promise.resolve();
        if (displayName !== getDisplayName(auth.currentUser)) {
            p = auth.currentUser.updateProfile({ displayName: displayName || '' });
        }
        p.then(function () {
            return saveUserProfile(uid, { icon: icon });
        }).then(function () {
            closeProfileSettingsModal();
            updateAuthUI();
            loadUserProfile(uid).then(function (profile) { renderProfilePage(profile); });
            showToast('プロフィールを更新しました');
        }).catch(function (err) {
            if (errorEl) {
                errorEl.textContent = err.message || '保存に失敗しました';
                errorEl.hidden = false;
            }
        });
    }

    function closeProfileView() {
        if (viewProfile) {
            viewProfile.hidden = true;
            viewProfile.style.display = 'none';
        }
        if (viewFeed) viewFeed.hidden = false;
        document.body.style.overflow = '';
    }

    function openPostModal(editId) {
        if (!isLoggedIn()) {
            showToast('ログインすると投稿・編集できます');
            showLoginModal();
            return;
        }
        editingId = editId || null;
        var titleEl = document.getElementById('post-title');
        var contentEl = document.getElementById('post-content');
        var tagsEl = document.getElementById('post-tags');
        var submitBtn = document.getElementById('submit-post');

        if (editingId) {
            var item = thoughts.find(function (t) { return t.id === editingId; });
            submitBtn.textContent = '更新する';
            titleEl.value = item ? item.title : '';
            contentEl.innerHTML = item ? item.content : '';
            tagsEl.value = item && item.tags ? item.tags.join(', ') : '';
        } else {
            submitBtn.textContent = '投稿する';
            titleEl.value = '';
            contentEl.innerHTML = '';
            tagsEl.value = '';
        }
        updateCharCounts();
        if (viewFeed) viewFeed.hidden = true;
        if (viewEditor) viewEditor.hidden = false;
        document.body.style.overflow = 'hidden';
        if (titleEl) titleEl.focus();
    }

    function updateCharCounts() {
        var titleEl = document.getElementById('post-title');
        var contentEl = document.getElementById('post-content');
        var titleCount = document.getElementById('title-count');
        var contentCount = document.getElementById('content-count');
        if (titleCount) titleCount.textContent = (titleEl ? titleEl.value.length : 0) + ' / 120';
        if (contentCount) contentCount.textContent = (contentEl ? (contentEl.textContent || '').length : 0) + ' 文字';
    }

    function deletePost(id) {
        thoughts = thoughts.filter(function (t) { return t.id !== id; });
        if (db) {
            db.collection(FIRESTORE_COLLECTION).doc(id).delete().catch(function (err) {
                console.warn('Firestore delete failed:', err);
            });
        }
        save();
    }

    function submitPost() {
        if (!isLoggedIn()) {
            showToast('ログインしてください');
            return;
        }
        var titleEl = document.getElementById('post-title');
        var contentEl = document.getElementById('post-content');
        var tagsEl = document.getElementById('post-tags');
        var title = titleEl ? titleEl.value.trim() : '';
        var content = contentEl ? contentEl.innerHTML.replace(/\u200B/g, '') : '';
        var rawTags = (tagsEl && tagsEl.value) ? tagsEl.value.split(/[,，、\s]+/) : [];
        var tags = rawTags.map(function (t) { return t.trim(); }).filter(Boolean);

        var plainText = contentEl ? (contentEl.textContent || '').replace(/\u200B/g, '').trim() : '';
        if (!title || !plainText) {
            showToast('タイトルと内容を入力してください');
            return;
        }

        var uid = auth && auth.currentUser ? auth.currentUser.uid : '';
        var displayName = auth && auth.currentUser ? getDisplayName(auth.currentUser) : '';
        function doSave(authorIcon) {
            authorIcon = authorIcon || '👤';
            if (editingId) {
                var item = thoughts.find(function (t) { return t.id === editingId; });
                if (item) {
                    item.title = title;
                    item.content = content;
                    item.tags = tags;
                    item.updatedAt = _now();
                    if (uid) { item.authorId = uid; item.authorDisplayName = displayName; item.authorIcon = authorIcon; }
                }
                showToast('更新しました');
            } else {
                thoughts.unshift({
                    id: _uid(),
                    title: title,
                    content: content,
                    tags: tags,
                    createdAt: _now(),
                    updatedAt: _now(),
                    likes: 0,
                    likedBy: [],
                    authorId: uid,
                    authorDisplayName: displayName,
                    authorIcon: authorIcon
                });
                showToast('投稿しました');
            }
            save();
            renderFeed();
            renderTagFilter();
            closeEditorView();
            editingId = null;
            titleEl.value = '';
            contentEl.innerHTML = '';
            if (tagsEl) tagsEl.value = '';
            updateCharCounts();
        }
        if (uid && db) {
            loadUserProfile(uid).then(function (profile) { doSave(profile.icon); });
        } else {
            doSave('👤');
        }
    }

    function initTheme() {
        var theme = localStorage.getItem(THEME_KEY) || 'light';
        document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
    }

    function toggleTheme() {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
        localStorage.setItem(THEME_KEY, isDark ? 'light' : 'dark');
        showToast(isDark ? 'ライトモード' : 'ダークモード');
        renderFeed();
        if (currentDetailId) showDetail(currentDetailId);
        if (viewProfile && !viewProfile.hidden) renderProfilePage();
    }

    function exportData() {
        var data = JSON.stringify(thoughts, null, 2);
        var blob = new Blob([data], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'philo-posts-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('エクスポートしました');
    }

    function importData(file) {
        if (!file || !file.name) return;
        var reader = new FileReader();
        reader.onload = function () {
            try {
                var arr = JSON.parse(reader.result);
                if (!Array.isArray(arr)) throw new Error('Invalid format');
                var merged = arr.concat(thoughts);
                var seen = new Set();
                thoughts = merged.filter(function (t) {
                    var id = t.id || t.title + (t.content || '');
                    if (seen.has(id)) return false;
                    seen.add(id);
                    if (!t.id) t.id = _uid();
                    if (!t.createdAt) t.createdAt = _now();
                    if (!t.updatedAt) t.updatedAt = _now();
                    if (!t.tags) t.tags = [];
                    if (typeof t.likes !== 'number') t.likes = 0;
                    return true;
                });
                save();
                renderFeed();
                renderTagFilter();
                showToast('インポートしました');
            } catch (e) {
                showToast('インポートに失敗しました');
            }
        };
        reader.readAsText(file);
    }

    // イベント
    document.getElementById('post-trigger').addEventListener('click', function () {
        if (!isLoggedIn()) {
            showToast('ログインすると投稿できます');
            showLoginModal();
            return;
        }
        openPostModal(null);
    });
    var editorBack = document.getElementById('editor-back');
    if (editorBack) editorBack.addEventListener('click', function () { closeEditorView(); editingId = null; });
    document.getElementById('close-detail').addEventListener('click', function () { closeModal(modalOverlay); });
    document.getElementById('submit-post').addEventListener('click', submitPost);

    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('import-file').addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        importData(f);
        e.target.value = '';
    });

    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(renderFeed, 180);
    });
    searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { searchInput.value = ''; renderFeed(); }
    });
    filterTag.addEventListener('change', renderFeed);
    if (filterSort) filterSort.addEventListener('change', renderFeed);

    document.getElementById('post-title').addEventListener('input', updateCharCounts);
    document.getElementById('post-content').addEventListener('input', updateCharCounts);

    modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) closeModal(modalOverlay);
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var authOverlay = document.getElementById('auth-overlay');
            var profileSettingsOverlay = document.getElementById('profile-settings-overlay');
            if (authOverlay && !authOverlay.hidden) {
                closeLoginModal();
            } else if (profileSettingsOverlay && !profileSettingsOverlay.hidden) {
                closeProfileSettingsModal();
            } else if (viewProfile && !viewProfile.hidden) {
                closeProfileView();
            } else if (viewEditor && !viewEditor.hidden) {
                closeEditorView();
                editingId = null;
            } else if (modalOverlay.classList.contains('is-open')) {
                closeModal(modalOverlay);
            }
        }
    });

    function showAuthError(msg) {
        var el = document.getElementById('auth-error');
        if (el) {
            el.textContent = msg || '';
            el.hidden = !msg;
        }
    }

    function doSignIn(email, password) {
        if (!auth) return;
        showAuthError('');
        auth.signInWithEmailAndPassword(email, password).then(function () {
            closeLoginModal();
            showToast('ログインしました');
        }).catch(function (err) {
            var msg = err.code === 'auth/user-not-found' ? 'このメールアドレスは登録されていません。' :
                err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' ? 'パスワードが違います。' :
                err.code === 'auth/invalid-email' ? 'メールアドレスの形式が正しくありません。' :
                err.message || 'ログインに失敗しました。';
            showAuthError(msg);
        });
    }

    function doSignUp(email, password) {
        if (!auth) return;
        showAuthError('');
        auth.createUserWithEmailAndPassword(email, password).then(function () {
            closeLoginModal();
            showToast('アカウントを作成しました');
        }).catch(function (err) {
            var msg = err.code === 'auth/email-already-in-use' ? 'このメールアドレスは既に使われています。' :
                err.code === 'auth/weak-password' ? 'パスワードは6文字以上にしてください。' :
                err.code === 'auth/invalid-email' ? 'メールアドレスの形式が正しくありません。' :
                err.message || '登録に失敗しました。';
            showAuthError(msg);
        });
    }

    function doGoogleSignIn() {
        if (!auth) return;
        showAuthError('');
        var provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then(function () {
            closeLoginModal();
            showToast('ログインしました');
        }).catch(function (err) {
            if (err.code !== 'auth/popup-closed-by-user') {
                showAuthError(err.message || 'Googleログインに失敗しました。');
            }
        });
    }

    if (auth) {
        auth.onAuthStateChanged(function () {
            updateAuthUI();
        });
    }
    updateAuthUI();

    var loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', showLoginModal);
    var profileTrigger = document.getElementById('profile-trigger');
    if (profileTrigger) profileTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleProfileDropdown();
    });
    var profilePageBtn = document.getElementById('profile-page-btn');
    if (profilePageBtn) profilePageBtn.addEventListener('click', function () {
        closeProfileDropdown();
        openProfileView();
    });
    var profileBackBtn = document.getElementById('profile-back-btn');
    if (profileBackBtn) profileBackBtn.addEventListener('click', closeProfileView);
    var profileSettingsBtn = document.getElementById('profile-settings-btn');
    if (profileSettingsBtn) profileSettingsBtn.addEventListener('click', openProfileSettingsModal);
    var profileSettingsClose = document.getElementById('profile-settings-close');
    if (profileSettingsClose) profileSettingsClose.addEventListener('click', closeProfileSettingsModal);
    var profileSettingsCancel = document.getElementById('profile-settings-cancel');
    if (profileSettingsCancel) profileSettingsCancel.addEventListener('click', closeProfileSettingsModal);
    var profileSettingsSave = document.getElementById('profile-settings-save');
    if (profileSettingsSave) profileSettingsSave.addEventListener('click', saveProfileSettings);
    var profileSettingsOverlayEl = document.getElementById('profile-settings-overlay');
    if (profileSettingsOverlayEl) profileSettingsOverlayEl.addEventListener('click', function (e) {
        if (e.target === profileSettingsOverlayEl) closeProfileSettingsModal();
    });
    var profileLogout = document.getElementById('profile-logout');
    if (profileLogout) profileLogout.addEventListener('click', function () {
        closeProfileDropdown();
        if (auth) {
            auth.signOut().then(function () {
                updateAuthUI();
                showToast('ログアウトしました');
            }).catch(function () {
                updateAuthUI();
                showToast('ログアウトしました');
            });
        } else {
            updateAuthUI();
            showToast('ログアウトしました');
        }
    });
    document.addEventListener('click', function (e) {
        var wrap = document.getElementById('auth-user');
        if (wrap && !wrap.contains(e.target)) closeProfileDropdown();
    });
    var authClose = document.getElementById('auth-close');
    if (authClose) authClose.addEventListener('click', closeLoginModal);
    var authOverlayEl = document.getElementById('auth-overlay');
    if (authOverlayEl) authOverlayEl.addEventListener('click', function (e) {
        if (e.target === authOverlayEl) closeLoginModal();
    });
    var authSigninBtn = document.getElementById('auth-signin-btn');
    if (authSigninBtn) authSigninBtn.addEventListener('click', function () {
        var email = (document.getElementById('auth-email-input').value || '').trim();
        var password = (document.getElementById('auth-password-input').value || '');
        if (!email || !password) {
            showAuthError('メールアドレスとパスワードを入力してください。');
            return;
        }
        doSignIn(email, password);
    });
    var authSignupBtn = document.getElementById('auth-signup-btn');
    if (authSignupBtn) authSignupBtn.addEventListener('click', function () {
        var email = (document.getElementById('auth-email-input').value || '').trim();
        var password = (document.getElementById('auth-password-input').value || '');
        if (!email || !password) {
            showAuthError('メールアドレスとパスワードを入力してください。');
            return;
        }
        if (password.length < 6) {
            showAuthError('パスワードは6文字以上にしてください。');
            return;
        }
        doSignUp(email, password);
    });
    var authGoogleBtn = document.getElementById('auth-google-btn');
    if (authGoogleBtn) authGoogleBtn.addEventListener('click', doGoogleSignIn);

    initTheme();
    initRichEditor();
    renderTagFilter();
    renderFeed();

    if (db) {
        loadFromFirestore().then(function (data) {
            if (data && data.length > 0) {
                thoughts = data;
            }
            save();
            renderFeed();
            renderTagFilter();
        }).catch(function () {
            renderFeed();
        });
    }
})();
