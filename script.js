(function () {
    'use strict';

    const STORAGE_KEY = 'philo_posts';
    const THEME_KEY = 'philo_theme';
    const FIRESTORE_COLLECTION = 'posts';
    const FIRESTORE_USERS_COLLECTION = 'users';
    var myFollowingSet = new Set();
    const PROFILE_ICON_OPTIONS = ['👤', '👨', '👩', '🧑', '🎭', '🦊', '🐱', '🐶', '🌟', '✨', '🎨', '📚', '🌸', '🍀'];
    const PROFILE_ICON_INITIAL = 'initial';
    const PROFILE_ICON_BG_OPTIONS = [
        '', '#1a73e8', '#34a853', '#ea4335', '#f9ab00', '#8b5cf6', '#ec4899', '#0ea5e9', '#64748b', '#14b8a6'
    ];
    const TITLE_MAX_LENGTH = 50;
    const DISPLAY_NAME_MAX_LENGTH = 20;
    const BIO_MAX_LENGTH = 160;
    const VERIFIED_FOLLOWERS_THRESHOLD = 500;

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
            loginBtn.setAttribute('hidden', '');
            authUser.hidden = false;
            authUser.removeAttribute('hidden');
            authUser.style.display = '';
            if (postTrigger) postTrigger.style.visibility = '';
            if (auth && auth.currentUser && db) {
                loadUserProfile(auth.currentUser.uid).then(function (profile) {
                    updateHeaderAvatar(profile);
                    if (displayNameEl) {
                        var name = getDisplayName(auth.currentUser);
                        displayNameEl.innerHTML = _escape(name) + ((profile.followersCount || 0) > VERIFIED_FOLLOWERS_THRESHOLD ? getVerifiedBadgeHtml() : '');
                    }
                });
                loadMyFollowing();
            } else if (displayNameEl && auth && auth.currentUser) {
                displayNameEl.textContent = getDisplayName(auth.currentUser);
            }
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
            toc: Array.isArray(t.toc) ? t.toc : [],
            createdAt: t.createdAt || _now(),
            updatedAt: t.updatedAt || t.createdAt || _now(),
            likes: typeof t.likes === 'number' ? t.likes : 0,
            likedBy: Array.isArray(t.likedBy) ? t.likedBy : [],
            authorId: t.authorId || '',
            authorDisplayName: t.authorDisplayName || '',
            authorIcon: t.authorIcon || '👤',
            authorIconBg: t.authorIconBg || '',
            authorFollowersCount: typeof t.authorFollowersCount === 'number' ? t.authorFollowersCount : 0
        };
    }

    function isLikedByMe(thought) {
        if (!auth || !auth.currentUser || !thought.likedBy) return false;
        return thought.likedBy.indexOf(auth.currentUser.uid) >= 0;
    }

    function isLikedByMeReply(reply) {
        if (!auth || !auth.currentUser || !reply.likedBy) return false;
        return reply.likedBy.indexOf(auth.currentUser.uid) >= 0;
    }

    function getLikeIconSrc(liked) {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) return liked ? 'images/テーマ黒用いいね済み.png' : 'images/白色いいね通常時.png';
        return liked ? 'images/テーマ白用いいね済み.png' : 'images/黒色いいね通常時.png';
    }

    let raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    let thoughts = Array.isArray(raw) && raw.length > 0 ? raw : [
        { id: _uid(), title: "変化の唯一性", content: "この世で唯一変化しないものは、<b>変化し続ける</b>ということだけである。", tags: ["変化", "存在"], createdAt: _now(), updatedAt: _now() },
        { id: _uid(), title: "美しさと主観", content: "美しさは物自体にあるのではなく、<font size='5'>それを見る人の心</font>の中にある。", tags: ["美", "主観"], createdAt: _now(), updatedAt: _now() }
    ];
    thoughts = thoughts.map(normalizeThought);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thoughts));

    const feed = document.getElementById('feed');
    const feedTimeline = document.getElementById('feed-timeline');
    const emptyState = document.getElementById('empty-state');
    const popularTagsSection = document.getElementById('popular-tags-section');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalBody = document.getElementById('modal-body');
    const viewArticle = document.getElementById('view-article');
    const articleBody = document.getElementById('article-body');
    var previousViewBeforeArticle = 'feed'; // 'feed' | 'profile'

    function getDetailContainer() {
        return (viewArticle && !viewArticle.hidden && articleBody) ? articleBody : null;
    }
    const viewFeed = document.getElementById('view-feed');
    const viewEditor = document.getElementById('view-editor');
    const viewProfile = document.getElementById('view-profile');
    const viewSettings = document.getElementById('view-settings');
    const filterSort = document.getElementById('filter-sort');
    const searchInput = document.getElementById('search-input');
    const filterTag = document.getElementById('filter-tag');
    const searchHint = document.getElementById('search-hint');
    const toastEl = document.getElementById('toast');
    const deleteConfirmOverlay = document.getElementById('delete-confirm-overlay');
    const deleteConfirmCancel = document.getElementById('delete-confirm-cancel');
    const deleteConfirmOk = document.getElementById('delete-confirm-ok');

    let editingId = null;
    let pendingDeleteCallback = null;
    let currentDetailId = null;
    let searchTimeout = null;
    let viewingProfileUserId = null;
    var currentProfileForDrawer = { userId: null, following: [], followers: [] };

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
                    toc: d.toc,
                    createdAt: d.createdAt,
                    updatedAt: d.updatedAt,
                    likes: d.likes,
                    likedBy: d.likedBy,
                    authorId: d.authorId,
                    authorDisplayName: d.authorDisplayName,
                    authorIcon: d.authorIcon,
                    authorIconBg: d.authorIconBg,
                    authorFollowersCount: typeof d.authorFollowersCount === 'number' ? d.authorFollowersCount : 0
                }));
            });
            return list;
        });
    }

    /** フィードを更新（Firestoreから再取得 or 表示の再描画） */
    function doRefresh() {
        if (db) {
            loadFromFirestore().then(function (data) {
                thoughts = Array.isArray(data) ? data : [];
                save();
                renderFeed();
                renderTagFilter();
                if (isLoggedIn()) loadMyFollowing();
                showToast('更新しました');
            }).catch(function () {
                renderFeed();
                showToast('更新に失敗しました');
            });
        } else {
            renderFeed();
            showToast('更新しました');
        }
    }

    function loadUserProfile(uid) {
        if (!db || !uid) return Promise.resolve({ icon: '👤', iconBg: '', displayName: '', bio: '', following: [], followers: [], followersCount: 0 });
        return db.collection(FIRESTORE_USERS_COLLECTION).doc(uid).get()
            .then(function (doc) {
                var d = doc.data();
                return {
                    icon: (d && d.icon) || '👤',
                    iconBg: (d && d.iconBg) || '',
                    displayName: (d && d.displayName) || '',
                    bio: (d && d.bio) || '',
                    following: Array.isArray(d && d.following) ? d.following : [],
                    followers: Array.isArray(d && d.followers) ? d.followers : [],
                    followersCount: typeof (d && d.followersCount) === 'number' ? d.followersCount : 0
                };
            })
            .catch(function () { return { icon: '👤', iconBg: '', displayName: '', bio: '', following: [], followers: [], followersCount: 0 }; });
    }

    function loadMyFollowing() {
        if (!db || !auth || !auth.currentUser) return Promise.resolve();
        var uid = auth.currentUser.uid;
        var ref = db.collection(FIRESTORE_USERS_COLLECTION).doc(uid);
        return ref.get()
            .then(function (doc) {
                if (!doc.exists) {
                    return ref.set({ following: [] }, { merge: true }).then(function () {
                        myFollowingSet = new Set();
                    });
                }
                var d = doc.data();
                var arr = Array.isArray(d && d.following) ? d.following : [];
                myFollowingSet = new Set(arr);
            })
            .catch(function () { myFollowingSet = new Set(); });
    }

    function isFollowing(targetUid) {
        return !!targetUid && myFollowingSet.has(targetUid);
    }

    function followUser(targetUid) {
        if (!db || !auth || !auth.currentUser || !targetUid || targetUid === auth.currentUser.uid) return Promise.reject(new Error('invalid'));
        var myUid = auth.currentUser.uid;
        var batch = db.batch();
        var myRef = db.collection(FIRESTORE_USERS_COLLECTION).doc(myUid);
        batch.set(myRef, { following: firebase.firestore.FieldValue.arrayUnion(targetUid) }, { merge: true });
        var targetRef = db.collection(FIRESTORE_USERS_COLLECTION).doc(targetUid);
        batch.set(targetRef, {
            followersCount: firebase.firestore.FieldValue.increment(1),
            followers: firebase.firestore.FieldValue.arrayUnion(myUid)
        }, { merge: true });
        return batch.commit().then(function () {
            myFollowingSet.add(targetUid);
        });
    }

    function unfollowUser(targetUid) {
        if (!db || !auth || !auth.currentUser || !targetUid) return Promise.reject(new Error('invalid'));
        var myUid = auth.currentUser.uid;
        var batch = db.batch();
        var myRef = db.collection(FIRESTORE_USERS_COLLECTION).doc(myUid);
        batch.set(myRef, { following: firebase.firestore.FieldValue.arrayRemove(targetUid) }, { merge: true });
        var targetRef = db.collection(FIRESTORE_USERS_COLLECTION).doc(targetUid);
        batch.set(targetRef, {
            followersCount: firebase.firestore.FieldValue.increment(-1),
            followers: firebase.firestore.FieldValue.arrayRemove(myUid)
        }, { merge: true });
        return batch.commit().then(function () {
            myFollowingSet.delete(targetUid);
        });
    }

    function getAuthorIconHtml(icon, iconBg, displayName, iconClass) {
        iconClass = iconClass || 'card-author-icon';
        var isInitial = icon === PROFILE_ICON_INITIAL;
        var content = isInitial
            ? _escape((displayName || '?').trim().charAt(0) || '?')
            : _escape(icon || '👤');
        var style = '';
        if (iconBg) style = ' style="background-color:' + _escape(iconBg) + (isInitial ? ';color:#fff' : '') + '"';
        var extraClass = isInitial ? ' ' + iconClass + '--initial' : '';
        var idAttr = (iconClass === 'profile-page-avatar') ? ' id="profile-page-avatar"' : '';
        return '<span class="' + _escape(iconClass) + extraClass + '"' + idAttr + ' aria-hidden="true"' + style + '>' + content + '</span>';
    }

    /** フォロワー数が閾値超のアカウント用の公式バッジHTML（表示名の横に表示） */
    function getVerifiedBadgeHtml() {
        return '<span class="verified-badge" aria-label="公式アカウント" title="フォロワー500人以上の公式アカウント">✓</span>';
    }

    function saveUserProfile(uid, data) {
        if (!db || !uid) return Promise.resolve();
        var payload = {};
        if (data.icon !== undefined) payload.icon = data.icon;
        if (data.iconBg !== undefined) payload.iconBg = data.iconBg;
        if (data.displayName !== undefined) payload.displayName = data.displayName;
        if (data.bio !== undefined) payload.bio = data.bio;
        if (Object.keys(payload).length === 0) return Promise.resolve();
        return db.collection(FIRESTORE_USERS_COLLECTION).doc(uid).set(payload, { merge: true });
    }

    var editorState = { size: 'normal', font: 'sans', color: null };

    var SIZE_MAP = { small: '0.875rem', normal: '1rem', large: '1.25rem', xlarge: '1.5rem' };
    var FONT_MAP = {
        sans: 'Noto Sans JP, sans-serif',
        serif: 'Noto Serif JP, serif',
        mplus1p: '"M PLUS 1p", sans-serif',
        shippori: '"Shippori Mincho", serif',
        zenkaku: '"Zen Kaku Gothic New", sans-serif',
        kosugi: '"Kosugi Maru", sans-serif'
    };

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

    /** 人気のタグを取得（投稿数が多い順、最大 limit 件） */
    function getPopularTags(limit) {
        const countByTag = {};
        thoughts.forEach(function (t) {
            (t.tags || []).forEach(function (tag) {
                var key = tag && tag.trim();
                if (key) {
                    countByTag[key] = (countByTag[key] || 0) + 1;
                }
            });
        });
        return Object.keys(countByTag)
            .map(function (tag) { return { tag: tag, count: countByTag[tag] }; })
            .sort(function (a, b) { return b.count - a.count; })
            .slice(0, limit || 6);
    }

    /** 急上昇タグを取得（直近7日以内の投稿に付いたタグを件数順、最大 limit 件） */
    function getTrendingTags(limit) {
        var now = Date.now();
        var sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        var countByTag = {};
        thoughts.forEach(function (t) {
            var updated = t.updatedAt || t.createdAt || '';
            var ts = typeof updated === 'number' ? updated : (new Date(updated)).getTime();
            if (isNaN(ts) || now - ts > sevenDaysMs) return;
            (t.tags || []).forEach(function (tag) {
                var key = tag && tag.trim();
                if (key) {
                    countByTag[key] = (countByTag[key] || 0) + 1;
                }
            });
        });
        return Object.keys(countByTag)
            .map(function (tag) { return { tag: tag, count: countByTag[tag] }; })
            .sort(function (a, b) { return b.count - a.count; })
            .slice(0, limit || 15);
    }

    /** 指定タグの投稿をいいね数順で最大 limit 件取得 */
    function getPopularPostsForTag(tag, limit) {
        return thoughts
            .filter(function (t) { return (t.tags || []).indexOf(tag) >= 0; })
            .sort(function (a, b) {
                var la = typeof a.likes === 'number' ? a.likes : 0;
                var lb = typeof b.likes === 'number' ? b.likes : 0;
                if (lb !== la) return lb - la;
                return (b.updatedAt || '') > (a.updatedAt || '') ? 1 : -1;
            })
            .slice(0, limit || 3);
    }

    /** カード1枚分のHTMLを生成（compact は人気タグ用のコンパクト表示） */
    function buildCardHtml(thought, compact) {
        var likes = typeof thought.likes === 'number' ? thought.likes : 0;
        var liked = isLikedByMe(thought);
        var likeImgSrc = getLikeIconSrc(liked);
        var authorName = thought.authorDisplayName || '匿名';
        var authorIconHtml = getAuthorIconHtml(thought.authorIcon, thought.authorIconBg, authorName, 'card-author-icon');
        var authorClass = thought.authorId ? ' card-author--clickable' : '';
        var verifiedBadge = ((thought.authorFollowersCount || 0) > VERIFIED_FOLLOWERS_THRESHOLD) ? getVerifiedBadgeHtml() : '';
        var plainText = (thought.content || '').replace(/<[^>]*>?/gm, '');
        var tagHtml = (thought.tags && thought.tags.length)
            ? thought.tags.map(function (t) { return '<span class="tag">' + _escape(t) + '</span>'; }).join('')
            : '';
        var cardClass = 'card' + (compact ? ' card--compact' : '');
        return '<div class="' + cardClass + '" data-id="' + _escape(thought.id) + '">' +
            '<div class="card-author' + authorClass + '" data-author-id="' + (thought.authorId || '') + '" role="button" tabindex="0" title="プロフィールを表示">' +
            authorIconHtml + '<span class="card-author-name">' + _escape(authorName) + '</span>' + verifiedBadge +
            '</div>' +
            '<h3>' + _escape(thought.title) + '</h3>' +
            '<div class="preview">' + _escape(plainText) + '</div>' +
            '<div class="meta">' + tagHtml +
            '<span class="date">' + _escape(formatDate(thought.updatedAt || thought.createdAt)) + '</span>' +
            '<button type="button" class="like-btn" data-id="' + _escape(thought.id) + '" title="高評価">' +
            '<img class="like-icon" src="' + _escape(likeImgSrc) + '" alt=""> <span class="like-count">' + likes + '</span>' +
            '</button></div></div>';
    }

    /** 人気タグセクションを描画（note風：人気タグ＋各タグの人気投稿最大3件） */
    function renderPopularTagsSection() {
        if (!popularTagsSection) return;
        var popular = getPopularTags(5);
        if (popular.length === 0) {
            popularTagsSection.hidden = true;
            return;
        }
        popularTagsSection.hidden = false;
        var html = '<h2 class="popular-tags-heading">人気のタグ</h2>';
        popular.forEach(function (item) {
            var posts = getPopularPostsForTag(item.tag, 3);
            if (posts.length === 0) return;
            html += '<div class="popular-tag-block" data-tag="' + _escape(item.tag) + '">';
            html += '<h3 class="popular-tag-name"><span class="popular-tag-label">' + _escape(item.tag) + '</span> <span class="popular-tag-count">' + item.count + '件</span></h3>';
            html += '<div class="popular-tag-posts">';
            posts.forEach(function (thought) {
                html += buildCardHtml(thought, true);
            });
            html += '</div></div>';
        });
        popularTagsSection.innerHTML = html;
        popularTagsSection.querySelectorAll('.popular-tag-block .card').forEach(function (cardEl) {
            var id = cardEl.dataset.id;
            var thought = thoughts.find(function (t) { return t.id === id; });
            if (!thought) return;
            cardEl.onclick = function (e) {
                if (e.target.closest('.like-btn')) return;
                if (e.target.closest('.card-author--clickable')) return;
                showDetail(thought.id);
            };
            var authorEl = cardEl.querySelector('.card-author[data-author-id]');
            if (authorEl && thought.authorId) {
                authorEl.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    openProfileView(thought.authorId);
                };
                authorEl.onkeydown = function (e) {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); authorEl.click(); }
                };
            }
            var likeBtn = cardEl.querySelector('.like-btn');
            if (likeBtn) {
                likeBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    incrementLike(thought.id);
                });
            }
        });
        popularTagsSection.querySelectorAll('.popular-tag-name').forEach(function (tagNameEl) {
            var tag = tagNameEl.closest('.popular-tag-block').dataset.tag;
            if (!tag || !filterTag) return;
            tagNameEl.addEventListener('click', function () {
                filterTag.value = tag;
                renderFeed();
            });
            tagNameEl.setAttribute('role', 'button');
            tagNameEl.setAttribute('tabindex', '0');
            tagNameEl.setAttribute('title', 'このタグでフィルター');
        });
    }

    /** PC用：左サイドバーに急上昇タグ・人気タグを縦並びで描画 */
    function renderFeedSidebar() {
        var trendingList = document.getElementById('trending-tags-list');
        var popularList = document.getElementById('popular-tags-list');
        if (!trendingList || !popularList || !filterTag) return;
        var trending = getTrendingTags(20);
        var popular = getPopularTags(20);
        function makeTagItem(item) {
            var li = document.createElement('li');
            li.className = 'feed-sidebar-tag-item';
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'feed-sidebar-tag-btn';
            btn.title = item.tag + ' (' + item.count + '件)でフィルター';
            btn.innerHTML = '<span class="feed-sidebar-tag-name">' + _escape(item.tag) + '</span> <span class="feed-sidebar-tag-count">' + item.count + '件</span>';
            btn.addEventListener('click', function () {
                filterTag.value = item.tag;
                renderFeed();
            });
            li.appendChild(btn);
            return li;
        }
        trendingList.innerHTML = '';
        trending.forEach(function (item) { trendingList.appendChild(makeTagItem(item)); });
        popularList.innerHTML = '';
        popular.forEach(function (item) { popularList.appendChild(makeTagItem(item)); });
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
        renderPopularTagsSection();
        renderFeedSidebar();
        var list = getFilteredThoughts();
        var timeline = feedTimeline || feed;
        var cards = timeline.querySelectorAll('.card');
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
            var plainText = (thought.content || '').replace(/<[^>]*>?/gm, '');
            var likes = typeof thought.likes === 'number' ? thought.likes : 0;
            var liked = isLikedByMe(thought);
            var likeImgSrc = getLikeIconSrc(liked);
            var authorName = thought.authorDisplayName || '匿名';
            var authorIconHtml = getAuthorIconHtml(thought.authorIcon, thought.authorIconBg, authorName, 'card-author-icon');
            var authorClass = thought.authorId ? ' card-author--clickable' : '';
            var verifiedBadge = ((thought.authorFollowersCount || 0) > VERIFIED_FOLLOWERS_THRESHOLD) ? getVerifiedBadgeHtml() : '';
            var card = document.createElement('div');
            card.className = 'card';
            card.dataset.id = thought.id;
            card.innerHTML =
                '<div class="card-author' + authorClass + '" data-author-id="' + (thought.authorId || '') + '" role="button" tabindex="0" title="プロフィールを表示">' +
                authorIconHtml +
                '<span class="card-author-name">' + _escape(authorName) + '</span>' + verifiedBadge +
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
                if (e.target.closest('.card-author--clickable')) return;
                showDetail(thought.id);
            };
            var authorEl = card.querySelector('.card-author[data-author-id]');
            if (authorEl && thought.authorId) {
                authorEl.onclick = function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    openProfileView(thought.authorId);
                };
                authorEl.onkeydown = function (e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        authorEl.click();
                    }
                };
            }
            var likeBtn = card.querySelector('.like-btn');
            if (likeBtn) {
                likeBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    incrementLike(thought.id);
                });
            }
            timeline.appendChild(card);
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
        var idx = item.likedBy.indexOf(uid);
        if (idx < 0) {
            item.likedBy.push(uid);
            item.likes = (typeof item.likes === 'number' ? item.likes : 0) + 1;
            showToast('高評価しました');
        } else {
            item.likedBy.splice(idx, 1);
            item.likes = Math.max(0, (typeof item.likes === 'number' ? item.likes : 0) - 1);
            showToast('高評価を解除しました');
        }
        save();
        renderFeed();
        var container = getDetailContainer();
        if (container && currentDetailId === id) {
            showDetail(id);
        }
        var runPop = function (el) {
            if (!el) return;
            el.classList.add('like-icon--pop');
            setTimeout(function () { el.classList.remove('like-icon--pop'); }, 350);
        };
        runPop(feed.querySelector('.card[data-id="' + id + '"] .like-icon'));
        if (container) runPop(container.querySelector('.detail-like-btn .like-icon'));
    }

    function closeArticleView() {
        if (viewArticle) viewArticle.hidden = true;
        currentDetailId = null;
        if (previousViewBeforeArticle === 'profile' && viewProfile) {
            viewProfile.hidden = false;
            viewProfile.style.display = 'flex';
            if (viewFeed) viewFeed.hidden = true;
            if (viewEditor) viewEditor.hidden = true;
        } else {
            if (viewFeed) viewFeed.hidden = false;
            if (viewProfile) viewProfile.hidden = true;
            if (viewProfile) viewProfile.style.display = 'none';
            if (viewEditor) viewEditor.hidden = true;
        }
        document.body.style.overflow = '';
    }

    function showDetail(id) {
        const item = thoughts.find(function (t) { return t.id === id; });
        if (!item) return;
        currentDetailId = id;
        if (viewFeed && !viewFeed.hidden) previousViewBeforeArticle = 'feed';
        if (viewProfile && !viewProfile.hidden) previousViewBeforeArticle = 'profile';
        if (viewFeed) viewFeed.hidden = true;
        if (viewProfile) viewProfile.hidden = true;
        if (viewProfile) viewProfile.style.display = 'none';
        if (viewEditor) viewEditor.hidden = true;
        if (viewArticle) {
            viewArticle.hidden = false;
            viewArticle.style.display = 'flex';
        }
        document.body.style.overflow = '';

        const likes = typeof item.likes === 'number' ? item.likes : 0;
        var isOwnPost = isLoggedIn() && item.authorId && auth.currentUser.uid === item.authorId;
        var actionsHtml = isOwnPost
            ? '<div class="detail-actions">' +
              '<button type="button" class="btn btn--outline" data-action="edit" data-id="' + _escape(item.id) + '">編集</button>' +
              '<button type="button" class="btn danger" data-action="delete" data-id="' + _escape(item.id) + '">削除</button>' +
              '</div>'
            : '';
        var detailAuthorName = item.authorDisplayName || '匿名';
        var detailAuthorIconHtml = getAuthorIconHtml(item.authorIcon, item.authorIconBg, detailAuthorName, 'detail-author-icon');
        var detailVerifiedBadge = ((item.authorFollowersCount || 0) > VERIFIED_FOLLOWERS_THRESHOLD) ? getVerifiedBadgeHtml() : '';
        var detailLiked = isLikedByMe(item);
        var detailLikeImgSrc = getLikeIconSrc(detailLiked);
        var showFollowBtn = isLoggedIn() && item.authorId && !isOwnPost;
        var followBtnHtml = showFollowBtn
            ? '<button type="button" class="btn btn--outline btn-sm detail-follow-btn" data-action="follow" data-author-id="' + _escape(item.authorId) + '" title="' + (isFollowing(item.authorId) ? 'フォローを解除' : 'フォロー') + '">' +
              (isFollowing(item.authorId) ? 'フォローを解除' : 'フォロー') + '</button>'
            : '';
        var authorClickable = item.authorId ? ' detail-author--clickable' : '';
        var container = articleBody || modalBody;
        container.innerHTML =
            '<article class="detail-card">' +
            '<div class="detail-author-row">' +
            '<div class="detail-author' + authorClickable + '" data-author-id="' + (item.authorId || '') + '" role="button" tabindex="0" title="プロフィールを表示">' +
            detailAuthorIconHtml +
            '<span class="detail-author-name">' + _escape(detailAuthorName) + '</span>' + detailVerifiedBadge +
            '</div>' +
            followBtnHtml +
            '</div>' +
            '<h2 class="detail-title">' + _escape(item.title) + '</h2>' +
            '<div class="detail-meta-line">' +
            '<time class="detail-date" datetime="' + _escape(item.updatedAt || item.createdAt) + '">' + _escape(formatDate(item.updatedAt || item.createdAt)) + '</time>' +
            (item.tags && item.tags.length
                ? '<div class="detail-tags">' + item.tags.map(function (t) { return '<span class="tag">' + _escape(t) + '</span>'; }).join('') + '</div>'
                : '') +
            '</div>' +
            (item.toc && item.toc.length
                ? '<nav class="detail-toc" aria-label="目次"><p class="detail-toc-title">目次</p><ol class="detail-toc-list">' +
                  item.toc.map(function (entry, i) {
                      return '<li><a href="#toc-' + i + '" class="detail-toc-link">' + _escape(entry.title || '') + '</a></li>';
                  }).join('') +
                  '</ol></nav>'
                : '') +
            '<div class="detail-content">' + (item.toc && item.toc.length ? contentWithTocIds(item.content || '') : stripContentEditable(item.content || '')) + '</div>' +
            '<div class="detail-footer">' +
            '<button type="button" class="btn detail-like-btn" data-action="like" data-id="' + _escape(item.id) + '" title="高評価">' +
            '<img class="like-icon" src="' + _escape(detailLikeImgSrc) + '" alt=""><span class="detail-like-count">' + likes + '</span>' +
            '</button>' +
            actionsHtml +
            '</div>' +
            '</article>' +
            '<section class="detail-reply-section" aria-labelledby="detail-reply-heading">' +
            '<h3 id="detail-reply-heading" class="detail-reply-heading">返信 <span class="detail-reply-count-badge" id="detail-reply-count-badge"></span></h3>' +
            (isLoggedIn()
                ? '<form class="detail-reply-form" id="detail-reply-form" data-post-id="' + _escape(item.id) + '">' +
                  '<textarea class="detail-reply-textarea" name="replyBody" placeholder="返信を書く..." rows="3" maxlength="500"></textarea>' +
                  '<div class="detail-reply-actions">' +
                  '<span class="detail-reply-count" aria-live="polite">0 / 500</span>' +
                  '<button type="submit" class="btn primary btn-sm detail-reply-submit">送信</button>' +
                  '</div>' +
                  '</form>'
                : '<p class="detail-reply-login-hint">ログインすると返信できます。</p>') +
            '<div class="detail-reply-list" id="detail-reply-list" role="list"></div>' +
            '</section>';

        container.querySelectorAll('.detail-toc-link').forEach(function (link) {
            link.addEventListener('click', function (e) {
                var href = link.getAttribute('href');
                if (href && href.indexOf('#') === 0) {
                    var id = href.slice(1);
                    var target = container.querySelector('#' + id);
                    if (target) {
                        e.preventDefault();
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            });
        });

        var authorEl = container.querySelector('.detail-author[data-author-id]');
        if (authorEl && item.authorId) {
            authorEl.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                openProfileView(item.authorId);
                closeArticleView();
            };
            authorEl.onkeydown = function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    authorEl.click();
                }
            };
        }

        var followBtn = container.querySelector('[data-action="follow"]');
        if (followBtn) {
            followBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                var targetUid = followBtn.getAttribute('data-author-id');
                if (!targetUid) return;
                if (isFollowing(targetUid)) {
                    unfollowUser(targetUid).then(function () {
                        followBtn.textContent = 'フォロー';
                        followBtn.title = 'フォロー';
                        showToast('フォローを解除しました');
                    }).catch(function (err) {
                        console.error('フォロー解除に失敗:', err);
                        showToast('フォロー解除に失敗しました');
                    });
                } else {
                    followUser(targetUid).then(function () {
                        followBtn.textContent = 'フォローを解除';
                        followBtn.title = 'フォローを解除';
                        showToast('フォローしました');
                    }).catch(function (err) {
                        console.error('フォローに失敗:', err);
                        showToast('フォローに失敗しました');
                    });
                }
            };
        }

        container.querySelector('[data-action="like"]').onclick = function () {
            incrementLike(item.id);
        };
        if (isOwnPost) {
            var editBtn = container.querySelector('[data-action="edit"]');
            var deleteBtn = container.querySelector('[data-action="delete"]');
            if (editBtn) editBtn.onclick = function () {
                closeArticleView();
                openPostModal(item.id);
            };
            if (deleteBtn) deleteBtn.onclick = function () {
                showDeleteConfirm(function () {
                    deletePost(item.id);
                    closeArticleView();
                    renderFeed();
                    renderTagFilter();
                    showToast('削除しました');
                });
            };
        }

        var replyListEl = container.querySelector('#detail-reply-list');
        var replyCountBadge = container.querySelector('#detail-reply-count-badge');
        function renderReplyList(replies) {
            if (!replyListEl) return;
            var list = Array.isArray(replies) ? replies : [];
            var sorted = list.slice().sort(function (a, b) {
                var likesA = typeof a.likes === 'number' ? a.likes : 0;
                var likesB = typeof b.likes === 'number' ? b.likes : 0;
                if (likesB !== likesA) return likesB - likesA;
                return (a.createdAt || '').localeCompare(b.createdAt || '');
            });
            if (replyCountBadge) {
                replyCountBadge.textContent = sorted.length ? '(' + sorted.length + ')' : '';
                replyCountBadge.style.visibility = sorted.length ? 'visible' : 'hidden';
            }
            var currentUid = auth && auth.currentUser ? auth.currentUser.uid : '';
            replyListEl.innerHTML = sorted.map(function (r) {
                var name = (r.authorDisplayName || '匿名');
                var replyVerifiedBadge = ((r.authorFollowersCount || 0) > VERIFIED_FOLLOWERS_THRESHOLD) ? getVerifiedBadgeHtml() : '';
                var date = r.createdAt ? formatDate(r.createdAt) : '';
                var replyLikes = typeof r.likes === 'number' ? r.likes : 0;
                var replyLiked = isLikedByMeReply(r);
                var likeImgSrc = getLikeIconSrc(replyLiked);
                var replyId = (r.id || '').toString();
                var isMine = currentUid && r.authorId === currentUid;
                var deleteBtnHtml = isMine
                    ? '<button type="button" class="btn btn-sm danger detail-reply-delete-btn" data-action="reply-delete" data-post-id="' + _escape(item.id) + '" data-reply-id="' + _escape(replyId) + '" title="返信を削除">削除</button>'
                    : '';
                return '<div class="detail-reply-item" role="listitem" data-reply-id="' + _escape(replyId) + '">' +
                    '<div class="detail-reply-item-header">' +
                    '<span class="detail-reply-item-author">' + _escape(name) + '</span>' + replyVerifiedBadge +
                    '<time class="detail-reply-item-date" datetime="' + _escape(r.createdAt || '') + '">' + _escape(date) + '</time>' +
                    '</div>' +
                    '<div class="detail-reply-item-body">' + _escape(r.body || '') + '</div>' +
                    '<div class="detail-reply-item-footer">' +
                    '<div class="detail-reply-item-actions">' +
                    deleteBtnHtml +
                    '<button type="button" class="btn detail-reply-like-btn" data-action="reply-like" data-post-id="' + _escape(item.id) + '" data-reply-id="' + _escape(replyId) + '" title="高評価">' +
                    '<img class="like-icon" src="' + _escape(likeImgSrc) + '" alt=""><span class="detail-reply-like-count">' + replyLikes + '</span>' +
                    '</button>' +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }).join('');
            replyListEl.querySelectorAll('.detail-reply-like-btn').forEach(function (btn) {
                btn.onclick = function () {
                    var pid = btn.getAttribute('data-post-id');
                    var rid = btn.getAttribute('data-reply-id');
                    if (pid && rid) incrementReplyLike(pid, rid);
                };
            });
            replyListEl.querySelectorAll('.detail-reply-delete-btn').forEach(function (btn) {
                btn.onclick = function () {
                    var pid = btn.getAttribute('data-post-id');
                    var rid = btn.getAttribute('data-reply-id');
                    if (!pid || !rid) return;
                    var titleEl = document.getElementById('delete-confirm-title');
                    var descEl = document.getElementById('delete-confirm-desc');
                    if (titleEl) titleEl.textContent = '返信を削除しますか？';
                    if (descEl) descEl.textContent = 'この返信を削除します。取り消せません。';
                    showDeleteConfirm(function () {
                        deleteReply(pid, rid);
                        renderReplyList(item.replies);
                        showToast('返信を削除しました');
                        if (titleEl) titleEl.textContent = '投稿を削除しますか？';
                        if (descEl) descEl.textContent = 'この操作は取り消せません。投稿とその返信がすべて削除されます。';
                    });
                };
            });
        }
        renderReplyList(item.replies);
        if (db) {
            db.collection(FIRESTORE_COLLECTION).doc(item.id).collection('replies').orderBy('createdAt', 'asc').get()
                .then(function (snap) {
                    if (!snap || !snap.docs || !replyListEl) return;
                    var list = snap.docs.map(function (d) {
                        var data = d.data();
                        return {
                            id: d.id,
                            body: data.body,
                            authorId: data.authorId,
                            authorDisplayName: data.authorDisplayName || '匿名',
                            authorFollowersCount: typeof data.authorFollowersCount === 'number' ? data.authorFollowersCount : 0,
                            createdAt: data.createdAt,
                            likes: typeof data.likes === 'number' ? data.likes : 0,
                            likedBy: Array.isArray(data.likedBy) ? data.likedBy : []
                        };
                    });
                    item.replies = list;
                    renderReplyList(item.replies);
                })
                .catch(function (err) { console.warn('Replies load failed', err); });
        }

        var replyForm = container.querySelector('#detail-reply-form');
        if (replyForm) {
            var replyTextarea = replyForm.querySelector('.detail-reply-textarea');
            var replyCountEl = replyForm.querySelector('.detail-reply-count');
            function updateReplyCount() {
                var len = replyTextarea ? (replyTextarea.value || '').length : 0;
                if (replyCountEl) replyCountEl.textContent = len + ' / 500';
            }
            if (replyTextarea) {
                replyTextarea.addEventListener('input', updateReplyCount);
                updateReplyCount();
            }
            replyForm.addEventListener('submit', function (e) {
                e.preventDefault();
                if (!replyTextarea) return;
                var body = (replyTextarea.value || '').trim();
                if (!body) {
                    showToast('返信内容を入力してください');
                    return;
                }
                submitReply(item.id, body, function () {
                    renderReplyList(item.replies);
                });
                replyTextarea.value = '';
                updateReplyCount();
                showToast('返信を送信しました');
                renderReplyList(item.replies);
            });
        }
    }

    function submitReply(postId, body, onAdded) {
        if (!isLoggedIn() || !auth || !auth.currentUser) return;
        var uid = auth.currentUser.uid;
        var displayName = getDisplayName(auth.currentUser);
        function addReply(authorFollowersCount) {
            var fc = typeof authorFollowersCount === 'number' ? authorFollowersCount : 0;
            var newReply = {
                body: body,
                authorId: uid,
                authorDisplayName: displayName,
                authorFollowersCount: fc,
                createdAt: new Date().toISOString(),
                likes: 0,
                likedBy: []
            };
            if (db) {
                db.collection(FIRESTORE_COLLECTION).doc(postId).collection('replies').add({
                    body: body,
                    authorId: uid,
                    authorDisplayName: displayName,
                    authorFollowersCount: fc,
                    createdAt: new Date().toISOString(),
                    likes: 0,
                    likedBy: []
                }).then(function (ref) {
                    if (ref && ref.id) {
                        newReply.id = ref.id;
                        if (typeof onAdded === 'function') onAdded();
                    }
                }).catch(function (err) { console.warn('Reply save failed', err); });
            } else {
                newReply.id = _uid();
                if (typeof onAdded === 'function') onAdded();
            }
            var post = thoughts.find(function (t) { return t.id === postId; });
            if (post) {
                if (!post.replies) post.replies = [];
                post.replies.push(newReply);
            }
        }
        if (db && uid) {
            loadUserProfile(uid).then(function (p) { addReply(p.followersCount); });
        } else {
            addReply(0);
        }
    }

    var replyLikeUpdating = false;
    function updateReplyLikeInDOM(replyId, likes, liked) {
        var container = getDetailContainer();
        if (!container) return;
        var items = container.querySelectorAll('.detail-reply-item[data-reply-id]');
        var item = null;
        for (var i = 0; i < items.length; i++) {
            if (items[i].getAttribute('data-reply-id') === replyId) { item = items[i]; break; }
        }
        if (!item) return;
        var countEl = item.querySelector('.detail-reply-like-count');
        var imgEl = item.querySelector('.detail-reply-like-btn .like-icon');
        if (countEl) countEl.textContent = String(likes);
        if (imgEl) imgEl.src = getLikeIconSrc(liked);
    }
    function incrementReplyLike(postId, replyId) {
        if (!isLoggedIn() || !auth || !auth.currentUser) {
            showToast('ログインすると高評価できます');
            showLoginModal();
            return;
        }
        if (!replyId) return;
        if (replyLikeUpdating) return;
        var post = thoughts.find(function (t) { return t.id === postId; });
        if (!post || !Array.isArray(post.replies)) return;
        var reply = post.replies.find(function (r) { return (r.id || '') === replyId; });
        if (!reply) return;
        if (!Array.isArray(reply.likedBy)) reply.likedBy = [];
        var uid = auth.currentUser.uid;
        var idx = reply.likedBy.indexOf(uid);
        if (idx < 0) {
            reply.likedBy.push(uid);
            reply.likes = (typeof reply.likes === 'number' ? reply.likes : 0) + 1;
            showToast('高評価しました');
        } else {
            reply.likedBy.splice(idx, 1);
            reply.likes = Math.max(0, (typeof reply.likes === 'number' ? reply.likes : 0) - 1);
            showToast('高評価を解除しました');
        }
        var newLiked = isLikedByMeReply(reply);
        updateReplyLikeInDOM(replyId, reply.likes, newLiked);
        function refreshDetailView() {
            if (getDetailContainer() && currentDetailId === postId) {
                showDetail(postId);
            }
            replyLikeUpdating = false;
        }
        if (db) {
            replyLikeUpdating = true;
            db.collection(FIRESTORE_COLLECTION).doc(postId).collection('replies').doc(replyId).set({
                body: reply.body,
                authorId: reply.authorId,
                authorDisplayName: reply.authorDisplayName,
                createdAt: reply.createdAt,
                likes: reply.likes,
                likedBy: reply.likedBy
            }, { merge: true })
                .then(function () { refreshDetailView(); })
                .catch(function (err) {
                    console.warn('Reply like update failed', err);
                    if (idx < 0) {
                        var i = reply.likedBy.indexOf(uid);
                        if (i >= 0) reply.likedBy.splice(i, 1);
                        reply.likes = Math.max(0, (reply.likes || 0) - 1);
                    } else {
                        reply.likedBy.push(uid);
                        reply.likes = (reply.likes || 0) + 1;
                    }
                    replyLikeUpdating = false;
                    refreshDetailView();
                });
        } else {
            refreshDetailView();
        }
    }

    function closeModal(overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        currentDetailId = null;
    }

    function showDeleteConfirm(onConfirm) {
        pendingDeleteCallback = onConfirm;
        if (deleteConfirmOverlay) deleteConfirmOverlay.hidden = false;
    }

    function closeDeleteConfirm() {
        pendingDeleteCallback = null;
        var titleEl = document.getElementById('delete-confirm-title');
        var descEl = document.getElementById('delete-confirm-desc');
        if (titleEl) titleEl.textContent = '投稿を削除しますか？';
        if (descEl) descEl.textContent = 'この操作は取り消せません。投稿とその返信がすべて削除されます。';
        if (deleteConfirmOverlay) deleteConfirmOverlay.hidden = true;
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

    function getPostsByAuthor(uid) {
        if (!uid) return [];
        return thoughts.filter(function (t) { return t.authorId === uid; })
            .sort(function (a, b) { return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''); });
    }

    var lastRenderedProfile = null;
    var lastRenderedProfileOpts = null;

    function renderProfilePage(profile, opts) {
        opts = opts || {};
        if (!profile) {
            profile = lastRenderedProfile || { icon: '👤', iconBg: '', displayName: '', bio: '', following: [], followers: [], followersCount: 0 };
            opts = lastRenderedProfileOpts || {};
        } else {
            lastRenderedProfile = profile;
            lastRenderedProfileOpts = opts;
        }
        var avatarWrap = document.getElementById('profile-page-avatar');
        var nameEl = document.getElementById('profile-page-name');
        var bioEl = document.getElementById('profile-page-bio');
        var followersEl = document.getElementById('profile-followers-count');
        var followingEl = document.getElementById('profile-following-count');
        var postsCountEl = document.getElementById('profile-posts-count');
        var listEl = document.getElementById('profile-posts-list');
        var emptyEl = document.getElementById('profile-posts-empty');
        var settingsBtn = document.getElementById('profile-settings-btn');
        var followBtnWrap = document.getElementById('profile-follow-btn-wrap');
        if (!nameEl || !listEl) return;
        var isOtherUser = opts.isOtherUser && opts.userId;
        var displayName;
        var postsList;
        var followingCount = (profile.following && profile.following.length) || 0;
        var followersCount = Math.max(0, typeof profile.followersCount === 'number' ? profile.followersCount : 0);

        if (isOtherUser) {
            displayName = opts.displayName || profile.displayName || '匿名';
            postsList = getPostsByAuthor(opts.userId);
        } else {
            var user = auth && auth.currentUser ? auth.currentUser : null;
            displayName = user ? getDisplayName(user) : 'ログイン中';
            postsList = getMyPosts();
        }

        var profileSearchInput = document.getElementById('profile-search-input');
        var profileSortSelect = document.getElementById('profile-sort');
        var profileSearchHint = document.getElementById('profile-search-hint');
        var profileQuery = (profileSearchInput && profileSearchInput.value) ? profileSearchInput.value.trim().toLowerCase() : '';
        var profileSortOrder = (profileSortSelect && profileSortSelect.value) ? profileSortSelect.value : 'newest';
        var list = postsList.slice();
        if (profileQuery) {
            list = list.filter(function (t) {
                var plain = (t.content || '').replace(/<[^>]*>?/gm, '');
                var title = (t.title || '').toLowerCase();
                var tagsStr = (t.tags || []).join(' ').toLowerCase();
                return title.includes(profileQuery) || plain.toLowerCase().includes(profileQuery) || tagsStr.includes(profileQuery);
            });
        }
        if (profileSortOrder === 'popular') {
            list.sort(function (a, b) {
                var la = typeof a.likes === 'number' ? a.likes : 0;
                var lb = typeof b.likes === 'number' ? b.likes : 0;
                if (lb !== la) return lb - la;
                return (b.updatedAt || '') > (a.updatedAt || '') ? 1 : -1;
            });
        } else {
            var sortKey = profileSortOrder === 'oldest' ? 'createdAt' : 'updatedAt';
            list.sort(function (a, b) {
                var ta = a[sortKey] || '';
                var tb = b[sortKey] || '';
                if (profileSortOrder === 'oldest') return ta < tb ? -1 : ta > tb ? 1 : 0;
                return ta > tb ? -1 : ta < tb ? 1 : 0;
            });
        }

        if (avatarWrap) avatarWrap.outerHTML = getAuthorIconHtml(profile.icon, profile.iconBg, displayName, 'profile-page-avatar');
        nameEl.innerHTML = _escape(displayName) + (followersCount > VERIFIED_FOLLOWERS_THRESHOLD ? getVerifiedBadgeHtml() : '');
        if (bioEl) {
            var bioText = (profile.bio || '').trim();
            bioEl.textContent = bioText;
            bioEl.hidden = !bioText;
        }
        if (followersEl) followersEl.textContent = String(followersCount);
        if (followingEl) followingEl.textContent = String(isOtherUser ? followingCount : (profile.following && profile.following.length) || 0);
        if (postsCountEl) postsCountEl.textContent = String(postsList ? postsList.length : 0);
        if (profileSearchHint) {
            if (profileQuery && list.length === 0) profileSearchHint.textContent = '該当する投稿がありません。';
            else if (profileQuery) profileSearchHint.textContent = list.length + ' 件';
            else profileSearchHint.textContent = '';
        }

        if (settingsBtn) {
            settingsBtn.hidden = isOtherUser;
            if (!settingsBtn.hidden) settingsBtn.style.display = '';
            else settingsBtn.style.display = 'none';
        }
        if (followBtnWrap) {
            var showFollowBtn = isOtherUser && isLoggedIn();
            followBtnWrap.hidden = !showFollowBtn;
            if (!followBtnWrap.hidden) followBtnWrap.style.display = '';
            else followBtnWrap.style.display = 'none';
            if (isOtherUser && followBtnWrap) {
                var followBtn = followBtnWrap.querySelector('.profile-follow-btn');
                if (followBtn) {
                    followBtn.textContent = isFollowing(opts.userId) ? 'フォローを解除' : 'フォロー';
                    followBtn.title = isFollowing(opts.userId) ? 'フォローを解除' : 'フォロー';
                    followBtn.dataset.authorId = opts.userId;
                }
            }
        }

        listEl.innerHTML = '';
        if (list.length === 0) {
            if (emptyEl) {
                emptyEl.hidden = false;
                emptyEl.textContent = (profileQuery && postsList.length > 0) ? '該当する投稿がありません。' : 'まだ投稿がありません。';
            }
        } else {
            if (emptyEl) emptyEl.hidden = true;
            list.forEach(function (thought) {
                var plainText = (thought.content || '').replace(/<[^>]*>?/gm, '');
                var likes = typeof thought.likes === 'number' ? thought.likes : 0;
                var liked = isLikedByMe(thought);
                var likeImgSrc = getLikeIconSrc(liked);
                var authorName = thought.authorDisplayName || '匿名';
                var authorIconHtml = getAuthorIconHtml(thought.authorIcon, thought.authorIconBg, authorName, 'card-author-icon');
                var authorClass = thought.authorId ? ' card-author--clickable' : '';
                var cardVerifiedBadge = (followersCount > VERIFIED_FOLLOWERS_THRESHOLD) ? getVerifiedBadgeHtml() : '';
                var card = document.createElement('div');
                card.className = 'card profile-page-card-item';
                card.dataset.id = thought.id;
                card.innerHTML =
                    '<div class="card-author' + authorClass + '" data-author-id="' + (thought.authorId || '') + '" role="button" tabindex="0" title="プロフィールを表示">' +
                    authorIconHtml +
                    '<span class="card-author-name">' + _escape(authorName) + '</span>' + cardVerifiedBadge +
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
                    if (e.target.closest('.card-author--clickable')) return;
                    showDetail(thought.id);
                };
                var authorEl = card.querySelector('.card-author[data-author-id]');
                if (authorEl && thought.authorId) {
                    authorEl.onclick = function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        openProfileView(thought.authorId);
                    };
                    authorEl.onkeydown = function (e) {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            authorEl.click();
                        }
                    };
                }
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
        currentProfileForDrawer = {
            userId: isOtherUser ? opts.userId : (auth && auth.currentUser ? auth.currentUser.uid : null),
            following: profile.following || [],
            followers: profile.followers || []
        };
    }

    function openProfileView(uid) {
        if (!isLoggedIn() && !uid) return;
        var myUid = auth && auth.currentUser ? auth.currentUser.uid : null;
        if (!uid || uid === myUid) {
            viewingProfileUserId = null;
            if (!myUid) return;
            loadUserProfile(myUid).then(function (profile) {
                if (viewingProfileUserId !== null) return;
                renderProfilePage(profile);
            });
        } else {
            viewingProfileUserId = uid;
            var requestedUid = uid;
            loadUserProfile(uid).then(function (profile) {
                if (viewingProfileUserId !== requestedUid) return;
                var displayName = profile.displayName || '';
                if (!displayName) {
                    var firstPost = getPostsByAuthor(uid)[0];
                    if (firstPost) displayName = firstPost.authorDisplayName || '匿名';
                    else displayName = '匿名';
                }
                renderProfilePage(profile, {
                    isOtherUser: true,
                    userId: uid,
                    displayName: displayName
                });
                var followBtn = document.querySelector('.profile-follow-btn');
                if (followBtn) {
                    followBtn.onclick = function () {
                        var targetUid = followBtn.getAttribute('data-author-id');
                        if (!targetUid) return;
                        if (isFollowing(targetUid)) {
                            unfollowUser(targetUid).then(function () {
                                followBtn.textContent = 'フォロー';
                                followBtn.title = 'フォロー';
                                var fc = document.getElementById('profile-followers-count');
                                if (fc) fc.textContent = String(Math.max(0, parseInt(fc.textContent, 10) - 1));
                                showToast('フォローを解除しました');
                            }).catch(function (err) {
                                console.error('フォロー解除に失敗:', err);
                                showToast('フォロー解除に失敗しました');
                            });
                        } else {
                            followUser(targetUid).then(function () {
                                followBtn.textContent = 'フォローを解除';
                                followBtn.title = 'フォローを解除';
                                var fc = document.getElementById('profile-followers-count');
                                if (fc) fc.textContent = String(parseInt(fc.textContent, 10) + 1);
                                showToast('フォローしました');
                            }).catch(function (err) {
                                console.error('フォローに失敗:', err);
                                showToast('フォローに失敗しました');
                            });
                        }
                    };
                }
            });
        }
        if (viewFeed) viewFeed.hidden = true;
        if (viewEditor) viewEditor.hidden = true;
        closeFollowDrawer();
        var profileSearchInputEl = document.getElementById('profile-search-input');
        var profileSortEl = document.getElementById('profile-sort');
        if (profileSearchInputEl) profileSearchInputEl.value = '';
        if (profileSortEl) profileSortEl.value = 'newest';
        var profileSearchHintEl = document.getElementById('profile-search-hint');
        if (profileSearchHintEl) profileSearchHintEl.textContent = '';
        if (viewProfile) {
            viewProfile.hidden = false;
            viewProfile.style.display = 'flex';
        }
        document.body.style.overflow = '';
    }

    function openFollowDrawer(title, uids) {
        var overlay = document.getElementById('follow-drawer-overlay');
        var drawer = document.getElementById('follow-drawer');
        var titleEl = document.getElementById('follow-drawer-title');
        var listEl = document.getElementById('follow-drawer-list');
        var emptyEl = document.getElementById('follow-drawer-empty');
        var loadingEl = document.getElementById('follow-drawer-loading');
        if (!overlay || !drawer || !titleEl || !listEl) return;
        titleEl.textContent = title;
        listEl.innerHTML = '';
        emptyEl.hidden = true;
        loadingEl.hidden = false;
        overlay.hidden = false;
        drawer.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        drawer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        if (!uids || uids.length === 0) {
            loadingEl.hidden = true;
            emptyEl.hidden = false;
            emptyEl.textContent = title === 'フォロワー' ? 'フォロワーはいません' : 'フォローしている人はいません';
            return;
        }
        Promise.all(uids.map(function (uid) {
            return loadUserProfile(uid).then(function (p) { return { uid: uid, icon: p.icon, iconBg: p.iconBg, displayName: p.displayName || '匿名', followersCount: p.followersCount || 0 }; });
        })).then(function (users) {
            loadingEl.hidden = true;
            listEl.innerHTML = '';
            users.forEach(function (u) {
                var li = document.createElement('li');
                li.className = 'follow-drawer-item';
                li.dataset.uid = u.uid;
                var iconHtml = getAuthorIconHtml(u.icon, u.iconBg, u.displayName, 'follow-drawer-item-icon');
                var drawerVerifiedBadge = ((u.followersCount || 0) > VERIFIED_FOLLOWERS_THRESHOLD) ? getVerifiedBadgeHtml() : '';
                li.innerHTML = '<a href="#" class="follow-drawer-item-link" data-uid="' + _escape(u.uid) + '" role="button">' + iconHtml + '<span class="follow-drawer-item-name">' + _escape(u.displayName) + '</span>' + drawerVerifiedBadge + '</a>';
                var link = li.querySelector('.follow-drawer-item-link');
                if (link) {
                    link.addEventListener('click', function (e) {
                        e.preventDefault();
                        var targetUid = link.getAttribute('data-uid');
                        closeFollowDrawer();
                        if (targetUid) openProfileView(targetUid);
                    });
                }
                listEl.appendChild(li);
            });
        }).catch(function () {
            loadingEl.hidden = true;
            emptyEl.hidden = false;
            emptyEl.textContent = '読み込みに失敗しました';
        });
    }

    function closeFollowDrawer() {
        var overlay = document.getElementById('follow-drawer-overlay');
        var drawer = document.getElementById('follow-drawer');
        if (overlay) { overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true'); }
        if (drawer) { drawer.hidden = true; drawer.setAttribute('aria-hidden', 'true'); }
        document.body.style.overflow = '';
    }

    function openProfileSettingsModal() {
        if (!auth || !auth.currentUser) return;
        var overlay = document.getElementById('profile-settings-overlay');
        var nameInput = document.getElementById('profile-settings-display-name');
        var bioInput = document.getElementById('profile-settings-bio');
        var pickerEl = document.getElementById('profile-icon-picker');
        var bgPickerEl = document.getElementById('profile-icon-bg-picker');
        var errorEl = document.getElementById('profile-settings-error');
        if (!overlay || !nameInput || !pickerEl) return;
        nameInput.value = getDisplayName(auth.currentUser);
        updateDisplayNameCount();
        if (bioInput) updateBioCount();
        if (errorEl) errorEl.hidden = true;
        pickerEl.innerHTML = '';
        if (bgPickerEl) bgPickerEl.innerHTML = '';
        var uid = auth.currentUser.uid;
        loadUserProfile(uid).then(function (profile) {
            var currentIcon = profile.icon || '👤';
            var currentBg = profile.iconBg || '';
            if (bioInput) {
                bioInput.value = profile.bio || '';
                updateBioCount();
                bioInput.oninput = updateBioCount;
            }
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
            var initialBtn = document.createElement('button');
            initialBtn.type = 'button';
            initialBtn.className = 'profile-icon-option profile-icon-option--initial' + (currentIcon === PROFILE_ICON_INITIAL ? ' selected' : '');
            initialBtn.textContent = (getDisplayName(auth.currentUser) || '?').trim().charAt(0) || '頭';
            initialBtn.setAttribute('data-icon', PROFILE_ICON_INITIAL);
            initialBtn.title = '表示名の頭文字';
            initialBtn.addEventListener('click', function () {
                pickerEl.querySelectorAll('.profile-icon-option').forEach(function (b) { b.classList.remove('selected'); });
                initialBtn.classList.add('selected');
                var n = (nameInput.value || '').trim().charAt(0) || '?';
                initialBtn.textContent = n;
            });
            pickerEl.appendChild(initialBtn);
            nameInput.oninput = function () {
                var sel = pickerEl.querySelector('.profile-icon-option[data-icon="' + PROFILE_ICON_INITIAL + '"].selected');
                if (sel) sel.textContent = (nameInput.value || '').trim().charAt(0) || '?';
            };
            if (bgPickerEl) {
                PROFILE_ICON_BG_OPTIONS.forEach(function (bg) {
                    var b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'profile-icon-bg-option' + (bg === currentBg ? ' selected' : '');
                    b.setAttribute('data-bg', bg);
                    b.style.backgroundColor = bg || 'var(--bg-elevated)';
                    if (!bg) b.textContent = '—';
                    b.title = bg ? bg : 'デフォルト';
                    b.addEventListener('click', function () {
                        bgPickerEl.querySelectorAll('.profile-icon-bg-option').forEach(function (x) { x.classList.remove('selected'); });
                        b.classList.add('selected');
                    });
                    bgPickerEl.appendChild(b);
                });
            }
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
        var bgPickerEl = document.getElementById('profile-icon-bg-picker');
        var errorEl = document.getElementById('profile-settings-error');
        var displayName = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
        if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
            if (errorEl) {
                errorEl.textContent = '表示名は' + DISPLAY_NAME_MAX_LENGTH + '文字以内で入力してください';
                errorEl.hidden = false;
            }
            return;
        }
        var selectedBtn = pickerEl && pickerEl.querySelector('.profile-icon-option.selected');
        var icon = selectedBtn ? selectedBtn.getAttribute('data-icon') : '👤';
        var selectedBg = bgPickerEl && bgPickerEl.querySelector('.profile-icon-bg-option.selected');
        var iconBg = selectedBg ? (selectedBg.getAttribute('data-bg') || '') : '';
        if (errorEl) errorEl.hidden = true;
        var uid = auth.currentUser.uid;
        var p = Promise.resolve();
        if (displayName !== getDisplayName(auth.currentUser)) {
            p = auth.currentUser.updateProfile({ displayName: displayName || '' });
        }
        var bioInput = document.getElementById('profile-settings-bio');
        var bio = (bioInput && bioInput.value) ? bioInput.value.trim() : '';
        if (bio.length > BIO_MAX_LENGTH) {
            if (errorEl) {
                errorEl.textContent = '自己紹介は' + BIO_MAX_LENGTH + '文字以内で入力してください';
                errorEl.hidden = false;
            }
            return;
        }
        p.then(function () {
            return saveUserProfile(uid, { icon: icon, iconBg: iconBg, displayName: displayName || getDisplayName(auth.currentUser), bio: bio });
        }).then(function () {
            thoughts.forEach(function (t) {
                if (t.authorId === uid) {
                    t.authorDisplayName = displayName || getDisplayName(auth.currentUser);
                    t.authorIcon = icon;
                    t.authorIconBg = iconBg;
                }
            });
            save();
            closeProfileSettingsModal();
            updateAuthUI();
            loadUserProfile(uid).then(function (profile) {
                if (viewingProfileUserId === null) renderProfilePage(profile);
                updateHeaderAvatar(profile);
            });
            renderFeed();
            if (currentDetailId) {
                var item = thoughts.find(function (t) { return t.id === currentDetailId; });
                if (item && item.authorId === uid) showDetail(currentDetailId);
            }
            showToast('プロフィールを更新しました');
        }).catch(function (err) {
            if (errorEl) {
                errorEl.textContent = err.message || '保存に失敗しました';
                errorEl.hidden = false;
            }
        });
    }

    function updateHeaderAvatar(profile) {
        if (!profile) return;
        var avatarEl = document.querySelector('.profile-avatar');
        if (!avatarEl) return;
        var displayName = auth && auth.currentUser ? getDisplayName(auth.currentUser) : '';
        avatarEl.outerHTML = getAuthorIconHtml(profile.icon, profile.iconBg, displayName, 'profile-avatar');
    }

    function closeProfileView() {
        if (viewProfile) {
            viewProfile.hidden = true;
            viewProfile.style.display = 'none';
        }
        if (viewFeed) viewFeed.hidden = false;
        document.body.style.overflow = '';
    }

    var settingsListPanel = document.getElementById('settings-list-panel');
    var settingsContactPanel = document.getElementById('settings-contact-panel');
    var settingsTermsPanel = document.getElementById('settings-terms-panel');

    function showSettingsList() {
        if (settingsListPanel) settingsListPanel.hidden = false;
        if (settingsContactPanel) settingsContactPanel.hidden = true;
        if (settingsTermsPanel) settingsTermsPanel.hidden = true;
    }

    function showSettingsContact() {
        if (settingsListPanel) settingsListPanel.hidden = true;
        if (settingsContactPanel) settingsContactPanel.hidden = false;
        if (settingsTermsPanel) settingsTermsPanel.hidden = true;
    }

    function showSettingsTerms() {
        if (settingsListPanel) settingsListPanel.hidden = true;
        if (settingsContactPanel) settingsContactPanel.hidden = true;
        if (settingsTermsPanel) settingsTermsPanel.hidden = false;
    }

    function isSettingsSubPanelOpen() {
        return (settingsContactPanel && !settingsContactPanel.hidden) ||
            (settingsTermsPanel && !settingsTermsPanel.hidden);
    }

    function openSettingsView() {
        if (viewFeed) viewFeed.hidden = true;
        if (viewEditor) viewEditor.hidden = true;
        if (viewProfile) viewProfile.hidden = true;
        if (viewSettings) {
            viewSettings.hidden = false;
            viewSettings.style.display = 'flex';
        }
        showSettingsList();
        document.body.style.overflow = '';
    }

    function closeSettingsView() {
        if (viewSettings) {
            viewSettings.hidden = true;
            viewSettings.style.display = 'none';
        }
        showSettingsList();
        if (viewFeed) viewFeed.hidden = false;
        document.body.style.overflow = '';
    }

    function handleSettingsBack() {
        if (isSettingsSubPanelOpen()) {
            showSettingsList();
        } else {
            closeSettingsView();
        }
    }

    function updateContactCharCount() {
        var textarea = document.getElementById('contact-message');
        var countEl = document.getElementById('contact-char-count');
        if (textarea && countEl) {
            var len = (textarea.value || '').length;
            countEl.textContent = len + ' / 1000';
        }
    }

    function handleContactSubmit(e) {
        e.preventDefault();
        var emailEl = document.getElementById('contact-email');
        var messageEl = document.getElementById('contact-message');
        var errorEl = document.getElementById('contact-form-error');
        var email = (emailEl && emailEl.value) ? emailEl.value.trim() : '';
        var message = (messageEl && messageEl.value) ? messageEl.value.trim() : '';
        if (errorEl) errorEl.hidden = true;
        if (!email) {
            if (errorEl) {
                errorEl.textContent = 'メールアドレスを入力してください。';
                errorEl.hidden = false;
            }
            return;
        }
        if (!message) {
            if (errorEl) {
                errorEl.textContent = 'お問い合わせ内容を入力してください。';
                errorEl.hidden = false;
            }
            return;
        }
        var nameEl = document.getElementById('contact-name');
        var name = (nameEl && nameEl.value) ? nameEl.value.trim() : '';
        var subject = encodeURIComponent('PhiloStream お問い合わせ');
        var body = encodeURIComponent('お名前: ' + name + '\nメール: ' + email + '\n\n' + message);
        var mailto = 'mailto:?subject=' + subject + '&body=' + body;
        window.location.href = mailto;
        showToast('メールソフトで送信してください。');
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

        var tocEnable = document.getElementById('post-toc-enable');
        var tocBody = document.getElementById('editor-toc-body');
        var tocListEl = document.getElementById('editor-toc-list');

        if (editingId) {
            var item = thoughts.find(function (t) { return t.id === editingId; });
            if (!item || item.authorId !== auth.currentUser.uid) {
                showToast('この投稿は編集できません');
                editingId = null;
                return;
            }
            submitBtn.textContent = '更新する';
            titleEl.value = item ? item.title : '';
            contentEl.innerHTML = item ? item.content : '';
            tagsEl.value = item && item.tags ? item.tags.join(', ') : '';
            if (tocEnable && tocBody && tocListEl) {
                tocEnable.checked = !!(item.toc && item.toc.length > 0);
                tocBody.hidden = !tocEnable.checked;
                renderTocList(tocListEl, item.toc || []);
            }
        } else {
            submitBtn.textContent = '投稿する';
            titleEl.value = '';
            contentEl.innerHTML = '';
            tagsEl.value = '';
            if (tocEnable && tocBody && tocListEl) {
                tocEnable.checked = false;
                tocBody.hidden = true;
                renderTocList(tocListEl, []);
            }
        }
        updateCharCounts();
        if (viewFeed) viewFeed.hidden = true;
        if (viewProfile) viewProfile.hidden = true;
        if (viewArticle) viewArticle.hidden = true;
        if (viewEditor) viewEditor.hidden = false;
        document.body.style.overflow = 'hidden';
        if (titleEl) titleEl.focus();
    }

    function renderTocList(container, items) {
        if (!container) return;
        container.innerHTML = '';
        (items || []).forEach(function (entry, i) {
            var li = document.createElement('li');
            li.className = 'editor-toc-item';
            li.innerHTML = '<input type="text" class="editor-toc-item-input" value="' + _escape(entry.title || '') + '" placeholder="目次項目" maxlength="100">' +
                '<button type="button" class="editor-toc-item-remove" aria-label="削除" data-index="' + i + '">&times;</button>';
            container.appendChild(li);
        });
    }

    function getTocFromEditor() {
        var listEl = document.getElementById('editor-toc-list');
        if (!listEl) return [];
        var inputs = listEl.querySelectorAll('.editor-toc-item-input');
        var arr = [];
        inputs.forEach(function (inp) {
            var t = (inp.value || '').trim();
            if (t) arr.push({ title: t });
        });
        return arr;
    }

    function setTocInEditor(items) {
        var listEl = document.getElementById('editor-toc-list');
        if (!listEl) return;
        renderTocList(listEl, items || []);
    }

    function getHeadingsFromContent() {
        var contentEl = document.getElementById('post-content');
        if (!contentEl) return [];
        var headings = contentEl.querySelectorAll('h2, h3');
        var arr = [];
        headings.forEach(function (h) {
            var t = (h.textContent || '').trim();
            if (t) arr.push({ title: t });
        });
        return arr;
    }

    function insertHeading(level) {
        var editor = document.getElementById('post-content');
        if (!editor) return;
        editor.focus();
        var tag = level === 2 ? 'h2' : 'h3';
        var defaultText = level === 2 ? '見出し' : '小見出し';
        var sel = window.getSelection();
        var range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
        if (!range || !editor.contains(range.commonAncestorContainer)) {
            range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
        }
        var el = document.createElement(tag);
        el.textContent = defaultText;
        try {
            range.collapse(true);
            range.insertNode(el);
            range.setStartAfter(el);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) {
            editor.appendChild(el);
        }
    }

    function stripContentEditable(html) {
        if (!html) return '';
        var wrap = document.createElement('div');
        wrap.innerHTML = html;
        wrap.querySelectorAll('[contenteditable]').forEach(function (el) {
            el.removeAttribute('contenteditable');
        });
        return wrap.innerHTML;
    }

    function contentWithTocIds(html) {
        if (!html) return '';
        var wrap = document.createElement('div');
        wrap.innerHTML = html;
        wrap.querySelectorAll('[contenteditable]').forEach(function (el) {
            el.removeAttribute('contenteditable');
        });
        var headings = wrap.querySelectorAll('h2, h3');
        headings.forEach(function (h, i) {
            h.id = 'toc-' + i;
        });
        return wrap.innerHTML;
    }

    function updateCharCounts() {
        var titleEl = document.getElementById('post-title');
        var contentEl = document.getElementById('post-content');
        var titleCount = document.getElementById('title-count');
        var contentCount = document.getElementById('content-count');
        if (titleCount) titleCount.textContent = (titleEl ? titleEl.value.length : 0) + ' / ' + TITLE_MAX_LENGTH;
        if (contentCount) contentCount.textContent = (contentEl ? (contentEl.textContent || '').length : 0) + ' 文字';
    }

    function updateDisplayNameCount() {
        var el = document.getElementById('profile-settings-display-name');
        var countEl = document.getElementById('profile-display-name-count');
        if (countEl && el) countEl.textContent = (el.value || '').length + ' / ' + DISPLAY_NAME_MAX_LENGTH;
    }

    function updateBioCount() {
        var el = document.getElementById('profile-settings-bio');
        var countEl = document.getElementById('profile-bio-count');
        if (countEl && el) countEl.textContent = (el.value || '').length + ' / ' + BIO_MAX_LENGTH;
    }

    function deletePost(id) {
        var item = thoughts.find(function (t) { return t.id === id; });
        if (item && auth && auth.currentUser && item.authorId !== auth.currentUser.uid) {
            showToast('この投稿は削除できません');
            return;
        }
        thoughts = thoughts.filter(function (t) { return t.id !== id; });
        if (db) {
            db.collection(FIRESTORE_COLLECTION).doc(id).delete().catch(function (err) {
                console.warn('Firestore delete failed:', err);
            });
        }
        save();
    }

    function deleteReply(postId, replyId) {
        var post = thoughts.find(function (t) { return t.id === postId; });
        if (!post) return;
        if (auth && auth.currentUser) {
            var reply = (post.replies || []).find(function (r) { return (r.id || '') === replyId; });
            if (reply && reply.authorId !== auth.currentUser.uid) {
                showToast('この返信は削除できません');
                return;
            }
        }
        if (post.replies) {
            post.replies = post.replies.filter(function (r) { return (r.id || '') !== replyId; });
        }
        if (db) {
            db.collection(FIRESTORE_COLLECTION).doc(postId).collection('replies').doc(replyId).delete()
                .catch(function (err) { console.warn('Firestore reply delete failed:', err); });
        }
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
        var tocEnabled = document.getElementById('post-toc-enable') && document.getElementById('post-toc-enable').checked;
        var toc = tocEnabled ? getTocFromEditor() : [];

        var plainText = contentEl ? (contentEl.textContent || '').replace(/\u200B/g, '').trim() : '';
        if (!title || !plainText) {
            showToast('タイトルと内容を入力してください');
            return;
        }
        if (title.length > TITLE_MAX_LENGTH) {
            showToast('タイトルは' + TITLE_MAX_LENGTH + '文字以内で入力してください');
            return;
        }

        var uid = auth && auth.currentUser ? auth.currentUser.uid : '';
        var displayName = auth && auth.currentUser ? getDisplayName(auth.currentUser) : '';
        function doSave(authorIcon, authorIconBg, authorFollowersCount) {
            authorIcon = authorIcon || '👤';
            authorIconBg = authorIconBg || '';
            var fc = typeof authorFollowersCount === 'number' ? authorFollowersCount : 0;
            if (editingId) {
                var item = thoughts.find(function (t) { return t.id === editingId; });
                if (item) {
                    item.title = title;
                    item.content = content;
                    item.tags = tags;
                    item.toc = toc;
                    item.updatedAt = _now();
                    if (uid) { item.authorId = uid; item.authorDisplayName = displayName; item.authorIcon = authorIcon; item.authorIconBg = authorIconBg; item.authorFollowersCount = fc; }
                }
                showToast('更新しました');
            } else {
                thoughts.unshift({
                    id: _uid(),
                    title: title,
                    content: content,
                    tags: tags,
                    toc: toc,
                    createdAt: _now(),
                    updatedAt: _now(),
                    likes: 0,
                    likedBy: [],
                    authorId: uid,
                    authorDisplayName: displayName,
                    authorIcon: authorIcon,
                    authorIconBg: authorIconBg,
                    authorFollowersCount: fc
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
            loadUserProfile(uid).then(function (profile) { doSave(profile.icon, profile.iconBg, profile.followersCount); });
        } else {
            doSave('👤', '', 0);
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
    var siteTitle = document.querySelector('.site-title');
    if (siteTitle) {
        siteTitle.setAttribute('title', 'タップで最上部へ／最上部なら更新');
        siteTitle.addEventListener('click', function () {
            var scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
            if (scrollTop <= 20) {
                doRefresh();
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    /* スマホ：一番上で下へスクロール（プルダウン）で更新（X/Twitter風） */
    (function () {
        var pullStartY = 0;
        var pullStartScrollTop = 0;
        var didPull = false;
        var scrollEl = document.documentElement;

        function getScrollTop() {
            return window.scrollY || window.pageYOffset || scrollEl.scrollTop || 0;
        }

        viewFeed.addEventListener('touchstart', function (e) {
            if (!viewFeed.hidden && e.touches.length === 1) {
                pullStartY = e.touches[0].clientY;
                pullStartScrollTop = getScrollTop();
                didPull = false;
            }
        }, { passive: true });

        viewFeed.addEventListener('touchmove', function (e) {
            if (e.touches.length !== 1 || viewFeed.hidden) return;
            if (pullStartScrollTop <= 5 && e.touches[0].clientY - pullStartY > 55) {
                didPull = true;
            }
        }, { passive: true });

        viewFeed.addEventListener('touchend', function () {
            if (viewFeed.hidden) return;
            if (didPull && getScrollTop() <= 10) {
                doRefresh();
            }
            didPull = false;
        }, { passive: true });
    })();

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
    var articleBackBtn = document.getElementById('article-back-btn');
    if (articleBackBtn) articleBackBtn.addEventListener('click', closeArticleView);
    document.getElementById('submit-post').addEventListener('click', submitPost);

    (function () {
        var tocEnable = document.getElementById('post-toc-enable');
        var tocBody = document.getElementById('editor-toc-body');
        if (tocEnable && tocBody) {
            tocEnable.addEventListener('change', function () {
                tocBody.hidden = !tocEnable.checked;
            });
        }
        var tocAddBtn = document.getElementById('toc-add-item');
        var tocListEl = document.getElementById('editor-toc-list');
        if (tocAddBtn && tocListEl) {
            tocAddBtn.addEventListener('click', function () {
                var items = getTocFromEditor();
                items.push({ title: '' });
                setTocInEditor(items);
            });
        }
        var tocFromHeadingsBtn = document.getElementById('toc-from-headings');
        if (tocFromHeadingsBtn) {
            tocFromHeadingsBtn.addEventListener('click', function () {
                var items = getHeadingsFromContent();
                if (items.length === 0) {
                    showToast('本文に見出し（H2・H3）がありません。ツールバーの H2 / H3 で挿入できます');
                    return;
                }
                setTocInEditor(items);
                showToast('見出しから目次を生成しました');
            });
        }
        if (tocListEl) {
            tocListEl.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest('.editor-toc-item-remove');
                if (!btn) return;
                e.preventDefault();
                var li = btn.closest('li');
                if (li) {
                    li.remove();
                }
            });
        }
        var toolH2 = document.getElementById('tool-h2');
        var toolH3 = document.getElementById('tool-h3');
        if (toolH2) toolH2.addEventListener('click', function () { insertHeading(2); });
        if (toolH3) toolH3.addEventListener('click', function () { insertHeading(3); });
    })();

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

    /* スマホ：キーボード表示時に入力欄・ツールバーが見えるようスクロール */
    function scrollEditorInputIntoView(el, options) {
        var delay = (options && options.delay) || 350;
        setTimeout(function () {
            if (el && el.scrollIntoView) el.scrollIntoView(options || { block: 'center', behavior: 'smooth' });
        }, delay);
    }
    var postTitleEl = document.getElementById('post-title');
    var postTagsEl = document.getElementById('post-tags');
    var postContentEl = document.getElementById('post-content');
    var postToolbarWrap = document.querySelector('.view-editor .editor-toolbar-wrap');
    if (postTitleEl) {
        postTitleEl.addEventListener('focus', function () { scrollEditorInputIntoView(postTitleEl); });
    }
    if (postTagsEl) {
        postTagsEl.addEventListener('focus', function () { scrollEditorInputIntoView(postTagsEl); });
    }
    if (postContentEl && postToolbarWrap) {
        postContentEl.addEventListener('focus', function () {
            setTimeout(function () {
                postToolbarWrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }, 320);
        });
    }

    modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) closeModal(modalOverlay);
    });

    if (deleteConfirmCancel) {
        deleteConfirmCancel.addEventListener('click', function () { closeDeleteConfirm(); });
    }
    if (deleteConfirmOk) {
        deleteConfirmOk.addEventListener('click', function () {
            if (pendingDeleteCallback) {
                pendingDeleteCallback();
                closeDeleteConfirm();
            }
        });
    }
    if (deleteConfirmOverlay) {
        deleteConfirmOverlay.addEventListener('click', function (e) {
            if (e.target === deleteConfirmOverlay) closeDeleteConfirm();
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var authOverlay = document.getElementById('auth-overlay');
            var profileSettingsOverlay = document.getElementById('profile-settings-overlay');
            if (deleteConfirmOverlay && !deleteConfirmOverlay.hidden) {
                closeDeleteConfirm();
            } else if (authOverlay && !authOverlay.hidden) {
                closeLoginModal();
            } else if (profileSettingsOverlay && !profileSettingsOverlay.hidden) {
                closeProfileSettingsModal();
            } else if (viewSettings && !viewSettings.hidden) {
                if (isSettingsSubPanelOpen()) {
                    showSettingsList();
                } else {
                    closeSettingsView();
                }
            } else if (viewProfile && !viewProfile.hidden) {
                closeProfileView();
            } else if (viewEditor && !viewEditor.hidden) {
                closeEditorView();
                editingId = null;
            } else if (viewArticle && !viewArticle.hidden) {
                closeArticleView();
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
    var profileSettingsMenuBtn = document.getElementById('profile-settings-menu-btn');
    if (profileSettingsMenuBtn) profileSettingsMenuBtn.addEventListener('click', function () {
        closeProfileDropdown();
        openSettingsView();
    });
    var profileBackBtn = document.getElementById('profile-back-btn');
    if (profileBackBtn) profileBackBtn.addEventListener('click', closeProfileView);
    var profileSortEl = document.getElementById('profile-sort');
    if (profileSortEl) profileSortEl.addEventListener('change', function () { renderProfilePage(); });
    var profileSearchInputEl = document.getElementById('profile-search-input');
    if (profileSearchInputEl) {
        profileSearchInputEl.addEventListener('input', function () { renderProfilePage(); });
        profileSearchInputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { profileSearchInputEl.value = ''; renderProfilePage(); }
        });
    }
    var profileFollowersTrigger = document.getElementById('profile-followers-trigger');
    if (profileFollowersTrigger) profileFollowersTrigger.addEventListener('click', function () {
        var uids = (currentProfileForDrawer && currentProfileForDrawer.followers) ? currentProfileForDrawer.followers : [];
        var countEl = document.getElementById('profile-followers-count');
        var displayedCount = countEl ? parseInt(countEl.textContent, 10) : 0;
        if (uids.length === 0 && displayedCount > 0 && currentProfileForDrawer && currentProfileForDrawer.userId) {
            loadUserProfile(currentProfileForDrawer.userId).then(function (profile) {
                var loaded = Array.isArray(profile.followers) ? profile.followers : [];
                if (currentProfileForDrawer && currentProfileForDrawer.userId) {
                    currentProfileForDrawer.followers = loaded;
                }
                openFollowDrawer('フォロワー', loaded);
            });
        } else {
            openFollowDrawer('フォロワー', uids);
        }
    });
    var profileFollowingTrigger = document.getElementById('profile-following-trigger');
    if (profileFollowingTrigger) profileFollowingTrigger.addEventListener('click', function () {
        openFollowDrawer('フォロー', (currentProfileForDrawer && currentProfileForDrawer.following) ? currentProfileForDrawer.following : []);
    });
    var followDrawerClose = document.getElementById('follow-drawer-close');
    if (followDrawerClose) followDrawerClose.addEventListener('click', closeFollowDrawer);
    var followDrawerOverlay = document.getElementById('follow-drawer-overlay');
    if (followDrawerOverlay) followDrawerOverlay.addEventListener('click', closeFollowDrawer);
    var settingsBackBtn = document.getElementById('settings-back-btn');
    if (settingsBackBtn) settingsBackBtn.addEventListener('click', handleSettingsBack);
    var settingsContactBtn = document.getElementById('settings-contact-btn');
    if (settingsContactBtn) settingsContactBtn.addEventListener('click', showSettingsContact);
    var settingsTermsBtn = document.getElementById('settings-terms-btn');
    if (settingsTermsBtn) settingsTermsBtn.addEventListener('click', showSettingsTerms);
    var contactForm = document.getElementById('contact-form');
    if (contactForm) contactForm.addEventListener('submit', handleContactSubmit);
    var contactMessage = document.getElementById('contact-message');
    if (contactMessage) contactMessage.addEventListener('input', updateContactCharCount);
    var profileSettingsBtn = document.getElementById('profile-settings-btn');
    if (profileSettingsBtn) profileSettingsBtn.addEventListener('click', openProfileSettingsModal);
    var profileSettingsClose = document.getElementById('profile-settings-close');
    if (profileSettingsClose) profileSettingsClose.addEventListener('click', closeProfileSettingsModal);
    var profileSettingsCancel = document.getElementById('profile-settings-cancel');
    if (profileSettingsCancel) profileSettingsCancel.addEventListener('click', closeProfileSettingsModal);
    var profileSettingsSave = document.getElementById('profile-settings-save');
    if (profileSettingsSave) profileSettingsSave.addEventListener('click', saveProfileSettings);
    var profileDisplayNameInput = document.getElementById('profile-settings-display-name');
    if (profileDisplayNameInput) profileDisplayNameInput.addEventListener('input', updateDisplayNameCount);
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
    /* スクロール時にプロフィールドロップダウンを閉じる */
    var scrollCloseTimeout = null;
    function onScrollCloseProfile() {
        var dropdown = document.getElementById('profile-dropdown');
        if (dropdown && !dropdown.hidden) closeProfileDropdown();
    }
    window.addEventListener('scroll', function () {
        if (scrollCloseTimeout) clearTimeout(scrollCloseTimeout);
        scrollCloseTimeout = setTimeout(onScrollCloseProfile, 50);
    }, { passive: true });

    /* 最上部ではそのまま表示。下スクロールでだんだんたたみ、上スクロールでだんだん広がる（transitionで滑らかに） */
    var siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
        var lastScrollY = window.scrollY || window.pageYOffset;
        var topThresh = 10;
        function updateHeaderByScroll() {
            var y = window.scrollY || window.pageYOffset;
            if (y <= topThresh) {
                siteHeader.classList.remove('site-header--hidden');
            } else if (y > lastScrollY) {
                siteHeader.classList.add('site-header--hidden');
            } else {
                siteHeader.classList.remove('site-header--hidden');
            }
            lastScrollY = y;
        }
        window.addEventListener('scroll', updateHeaderByScroll, { passive: true });
        updateHeaderByScroll();
    }

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

    var titleInput = document.getElementById('post-title');
    if (titleInput) titleInput.setAttribute('maxlength', String(TITLE_MAX_LENGTH));
    var displayNameInput = document.getElementById('profile-settings-display-name');
    if (displayNameInput) displayNameInput.setAttribute('maxlength', String(DISPLAY_NAME_MAX_LENGTH));

    initTheme();
    initRichEditor();
    renderTagFilter();
    renderFeed();

    if (db) {
        loadFromFirestore().then(function (data) {
            /* Firestore を正とする（空でも反映。コンソールで削除したら画面も空になる） */
            thoughts = Array.isArray(data) ? data : [];
            save();
            renderFeed();
            renderTagFilter();
        }).catch(function () {
            renderFeed();
        });
    }
})();
