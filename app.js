
/**
 * ============================================================
 * DIỄN ĐÀN MINI – HOÀN THIỆN MỨC 1 + MỨC 2 + MỨC 3
 * ============================================================
 *
 * MỨC 1:
 * - GET /posts bằng Axios.
 * - Hiển thị danh sách bài viết.
 * - Loading, empty, error, retry.
 *
 * MỨC 2:
 * - Phân trang bằng limit và skip.
 * - Tải thêm bài viết.
 * - Lấy danh sách tag.
 * - Tìm kiếm bài viết.
 * - Lọc theo tag.
 * - Sắp xếp bài viết.
 * - Debounce tìm kiếm 400ms.
 *
 * MỨC 3:
 * - Mở dialog chi tiết bài viết.
 * - Lấy thông tin tác giả.
 * - Cache tác giả bằng Map.
 * - Lấy và hiển thị bình luận.
 * - Loading, empty, error, retry cho bình luận.
 * - Gửi bình luận bằng POST.
 * - Đóng dialog bằng nút, Escape và click bên ngoài.
 * - AbortController hủy request cũ.
 * - Axios response interceptor chuẩn hóa lỗi.
 */

// ============================================================
// 1. CẤU HÌNH
// ============================================================

const BASE_URL = "https://dummyjson.com";
const PAGE_SIZE = 10;
const DEBOUNCE_MS = 400;

// ID người dùng giả lập vì bài tập chưa có chức năng đăng nhập.
const CURRENT_USER_ID = 1;

// Giới hạn độ dài bình luận.
const MAX_COMMENT_LENGTH = 500;

// Avatar mặc định phong cách công nghệ cyberpunk khi ảnh đang tải hoặc bị lỗi
const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cdefs%3E%3ClinearGradient id='cyberG' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%2300f0ff'/%3E%3Cstop offset='100%25' stop-color='%23a855f7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='20' cy='20' r='19' fill='%230f172a' stroke='url(%23cyberG)' stroke-width='2'/%3E%3Ccircle cx='20' cy='15' r='6' fill='%2300f0ff' fill-opacity='0.8'/%3E%3Cpath d='M9 34c0-5.5 4.5-10 11-10s11 4.5 11 10' fill='%23a855f7' fill-opacity='0.6'/%3E%3C/svg%3E";

// Tạo Axios instance dùng chung cấu hình.
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
});

// ============================================================
// 2. AXIOS RESPONSE INTERCEPTOR – CHUẨN HÓA LỖI
// ============================================================

api.interceptors.response.use(
  // Request thành công: giữ nguyên Axios response.
  (response) => {
    return response;
  },

  // Request thất bại: chuẩn hóa thông báo lỗi.
  (error) => {
    // Không xử lý AbortController như lỗi thông thường.
    if (
      axios.isCancel(error) ||
      error.code === "ERR_CANCELED"
    ) {
      return Promise.reject(error);
    }

    if (error.response) {
      // Máy chủ đã phản hồi nhưng có mã HTTP lỗi.
      const status = error.response.status;

      switch (status) {
        case 400:
          error.userMessage = "Dữ liệu gửi lên không hợp lệ.";
          break;

        case 401:
          error.userMessage = "Bạn cần đăng nhập để tiếp tục.";
          break;

        case 403:
          error.userMessage = "Bạn không có quyền truy cập.";
          break;

        case 404:
          error.userMessage = "Không tìm thấy dữ liệu.";
          break;

        case 500:
          error.userMessage = "Máy chủ đang gặp sự cố.";
          break;

        default:
          error.userMessage = "Đã xảy ra lỗi từ máy chủ.";
      }
    } else if (error.code === "ECONNABORTED") {
      // Request vượt quá thời gian timeout.
      error.userMessage = "Request đã vượt quá thời gian chờ.";
    } else if (error.request) {
      // Đã gửi request nhưng không nhận được response.
      error.userMessage = "Không thể kết nối đến máy chủ.";
    } else {
      // Lỗi xảy ra khi chuẩn bị request.
      error.userMessage = "Đã xảy ra lỗi khi gửi request.";
    }

    return Promise.reject(error);
  }
);

// ============================================================
// 3. TRUY XUẤT CÁC PHẦN TỬ HTML
// ============================================================

// Hàm tiện ích rút gọn document.querySelector().
const $ = (selector) => document.querySelector(selector);

// Thanh tìm kiếm, lọc và sắp xếp.
const searchForm = $("#search-form");
const keywordInput = $("#keyword");
const tagSelect = $("#tag");
const sortSelect = $("#sort");

// Vùng trạng thái và danh sách bài viết.
const statusEl = $("#status");
const statusText = $("#status-text");
const retryBtn = $("#retry-btn");
const postList = $("#post-list");
const loadMoreBtn = $("#load-more-btn");
const endMessage = $("#end-message");

// Template HTML.
const postCardTemplate = $("#post-card-template");
const commentTemplate = $("#comment-template");

// Các phần tử dialog chi tiết bài viết.
const dialog = $("#post-dialog");
const dialogClose = $("#dialog-close");
const dialogAuthorAvatar = $("#dialog-author-avatar");
const dialogAuthorName = $("#dialog-author-name");
const dialogTitle = $("#dialog-title");
const dialogTags = $("#dialog-tags");
const dialogBody = $("#dialog-body");

// Các phần tử bình luận.
const commentCount = $("#comment-count");
const commentStatus = $("#comment-status");
const commentStatusText = $("#comment-status-text");
const commentRetryBtn = $("#comment-retry-btn");
const commentList = $("#comment-list");
const commentForm = $("#comment-form");
const commentInput = $("#comment-input");
const commentSubmit = $("#comment-submit");

// ============================================================
// 4. TẠO VÙNG BÁO LỖI KHI GỬI BÌNH LUẬN
// ============================================================

// Nếu HTML chưa có vùng báo lỗi thì JavaScript tự tạo.
let commentFormError = $("#comment-form-error");

if (!commentFormError) {
  commentFormError = document.createElement("p");

  commentFormError.id = "comment-form-error";
  commentFormError.className = "status status--error is-hidden";
  commentFormError.setAttribute("role", "alert");

  // Chèn vùng lỗi trước nút gửi.
  commentForm.insertBefore(commentFormError, commentSubmit);
}

// ============================================================
// 5. STATE – TRẠNG THÁI DỮ LIỆU CỦA TRANG
// ============================================================

const state = {
  loadedCount: 0, // Số bài viết đã tải.
  total: 0,       // Tổng số bài viết từ API.
  keyword: "",    // Từ khóa tìm kiếm hiện tại.
  tag: "",        // Tag đang được chọn.
  sort: "",       // Kiểu sắp xếp hiện tại.
};

// ============================================================
// 6. BIẾN QUẢN LÝ REQUEST VÀ DIALOG
// ============================================================

// Lưu kiểu tải gần nhất để Retry đúng request.
let lastLoadWasLoadMore = false;

// ID bài viết đang được mở trong dialog.
let currentPostId = null;

// Cache thông tin tác giả.
const userCache = new Map();

// Controller của request danh sách bài viết.
let postsController = null;

// Controller của request bình luận.
let commentController = null;

// Mã định danh request chi tiết bài viết.
let postDetailRequestId = 0;

// Trạng thái gửi bình luận.
let isSubmittingComment = false;

// Lưu vị trí cuộn trang và thẻ bài viết đang chọn để tránh bị nhảy cuộn lên đầu trang
let savedScrollY = 0;
let lastClickedCard = null;

// Hàm khôi phục lại đúng vị trí cuộn trang và thẻ bài viết vừa xem
function restoreScrollPosition() {
  window.scrollTo({
    top: savedScrollY,
    left: 0,
    behavior: "instant",
  });
  if (lastClickedCard && typeof lastClickedCard.focus === "function") {
    try {
      lastClickedCard.focus({ preventScroll: true });
    } catch {
      // Bỏ qua nếu trình duyệt cũ không hỗ trợ preventScroll
    }
  }
}

// ============================================================
// 7. HÀM TIỆN ÍCH VÀ HIỂN THỊ TRẠNG THÁI
// ============================================================

/**
 * Hiển thị trạng thái của vùng danh sách.
 *
 * @param {string} type Loại trạng thái.
 * @param {string} message Nội dung thông báo.
 * @param {boolean} withRetry Có hiển thị nút Retry hay không.
 */
function showStatus(type, message, withRetry = false) {
  statusEl.classList.remove(
    "is-hidden",
    "status--loading",
    "status--error",
    "status--empty"
  );

  statusEl.classList.add(`status--${type}`);

  statusText.textContent = message;

  retryBtn.classList.toggle("is-hidden", !withRetry);
}

/**
 * Ẩn vùng trạng thái danh sách.
 */
function hideStatus() {
  statusEl.classList.add("is-hidden");
}

/**
 * Rút gọn chuỗi nếu vượt quá giới hạn ký tự.
 *
 * @param {string} text Chuỗi cần rút gọn.
 * @param {number} max Số ký tự tối đa.
 */
function truncate(text, max) {
  if (text.length <= max) {
    return text;
  }

  return text.slice(0, max) + "...";
}

// ============================================================
// 8. MỨC 1 – TẠO THẺ BÀI VIẾT
// ============================================================

/**
 * Nhân bản template và điền dữ liệu của một bài viết.
 *
 * @param {object} post Object bài viết từ API.
 * @returns {DocumentFragment} Node đã được điền dữ liệu.
 */
function createPostCard(post) {
  const node = postCardTemplate.content.cloneNode(true);

  const card = node.querySelector(".post-card");

  // Lưu ID bài viết và ID tác giả vào data attribute.
  card.dataset.postId = post.id;
  card.dataset.userId = post.userId;

  // Lấy các phần tử thông tin tác giả
  const authorAvatar = card.querySelector(".author__avatar");
  const authorName = card.querySelector(".author__name");

  // Thiết lập avatar và tên mặc định ban đầu để tránh vỡ ảnh
  if (authorAvatar) {
    authorAvatar.src = DEFAULT_AVATAR;
    authorAvatar.alt = `Tác giả #${post.userId}`;
    authorAvatar.onerror = () => {
      authorAvatar.src = DEFAULT_AVATAR;
    };
  }

  if (authorName) {
    authorName.textContent = `Tác giả #${post.userId}`;
  }

  // Tải thông tin tác giả từ API / cache để hiển thị tên và avatar thật
  getUser(post.userId)
    .then((user) => {
      if (user) {
        if (authorName && (user.firstName || user.lastName)) {
          authorName.textContent = `${user.firstName} ${user.lastName}`.trim();
        }
        if (authorAvatar && user.image) {
          authorAvatar.src = user.image;
          authorAvatar.alt = `${user.firstName} ${user.lastName}`.trim();
        }
      }
    })
    .catch((error) => {
      // Giữ nguyên thông tin tạm thời nếu không lấy được tác giả
      console.warn(`Không thể tải thông tin tác giả #${post.userId}:`, error);
    });

  // Hiển thị tiêu đề và nội dung bài viết.
  card.querySelector(".post-card__title").textContent = post.title;

  card.querySelector(".post-card__excerpt").textContent = truncate(
    post.body,
    150
  );

  // Hiển thị lượt xem và lượt thích.
  const viewsEl = card.querySelector(".stat__value--views");
  if (viewsEl) {
    viewsEl.textContent = post.views ?? 0;
  }

  const likesEl = card.querySelector(".stat__value--likes");
  if (likesEl) {
    likesEl.textContent =
      post.reactions?.likes ??
      (typeof post.reactions === "number" ? post.reactions : 0);
  }

  // Tạo danh sách tag.
  const tagsContainer = card.querySelector(".tags");

  if (post.tags && post.tags.length > 0) {
    post.tags.forEach((tag) => {
      const tagElement = document.createElement("li");

      tagElement.classList.add("tag");
      tagElement.textContent = tag;

      tagsContainer.appendChild(tagElement);
    });
  }

  return node;
}

// ============================================================
// 9. MỨC 2 – XÂY DỰNG REQUEST
// ============================================================

/**
 * Xây dựng endpoint và params dựa trên state.
 *
 * @param {number} skip Vị trí bắt đầu lấy dữ liệu.
 * @returns {object} Endpoint và params cho Axios.
 */
function buildRequest(skip = 0) {
  let url = "/posts";

  const params = {
    limit: PAGE_SIZE,
    skip: skip,
  };

  // Ưu tiên tìm kiếm nếu có keyword.
  if (state.keyword.trim() !== "") {
    url = "/posts/search";
    params.q = state.keyword.trim();
  }

  // Nếu không tìm kiếm thì xét lọc tag.
  else if (state.tag.trim() !== "") {
    url = `/posts/tag/${encodeURIComponent(state.tag.trim())}`;
  }

  // Xử lý sắp xếp.
  if (state.sort !== "") {
    const [sortBy, order] = state.sort.split("-");

    params.sortBy = sortBy;
    params.order = order;
  }

  return {
    url,
    params,
  };
}

// ============================================================
// 10. MỨC 1 + MỨC 2 – TẢI DANH SÁCH BÀI VIẾT
// ============================================================

/**
 * Tải danh sách bài viết.
 *
 * @param {boolean} isLoadMore true: tải thêm, false: tải mới.
 */
async function loadPosts(isLoadMore = false) {
  // Lưu kiểu tải hiện tại để Retry.
  lastLoadWasLoadMore = isLoadMore;

  // Hủy request danh sách trước đó nếu vẫn đang chạy.
  if (postsController) {
    postsController.abort();
  }

  // Tạo controller cho request mới.
  const controller = new AbortController();
  postsController = controller;

  // Nếu tải mới thì xóa danh sách cũ và bật status ở đầu trang.
  if (!isLoadMore) {
    postList.replaceChildren();

    loadMoreBtn.classList.add("is-hidden");
    endMessage.classList.add("is-hidden");

    showStatus("loading", "Đang tải...");
  } else {
    // Khi tải thêm: chỉ đổi trạng thái nút sang spinner công nghệ, không bật status ở đỉnh trang để chống giật cuộn
    loadMoreBtn.disabled = true;
    loadMoreBtn.innerHTML = '<span class="cyber-btn-spinner"></span> Đang tải...';
  }

  let keepStatusVisible = false;

  if (!isLoadMore) {
    loadMoreBtn.disabled = true;
  }

  try {
    // Xác định vị trí bắt đầu lấy dữ liệu.
    const skip = isLoadMore ? state.loadedCount : 0;

    // Xây dựng endpoint và params.
    const { url, params } = buildRequest(skip);

    // Gọi API và truyền AbortController.
    const response = await api.get(url, {
      params,
      signal: controller.signal,
    });

    // Không xử lý response nếu request đã bị thay thế.
    if (postsController !== controller) {
      return;
    }

    // Lấy dữ liệu.
    const posts = response.data.posts;

    // Cập nhật tổng số bài viết.
    state.total = response.data.total;

    // Cập nhật số bài viết đã tải.
    state.loadedCount = skip + posts.length;

    // Xử lý khi API không trả về bài viết.
    if (posts.length === 0) {
      loadMoreBtn.classList.add("is-hidden");

      if (isLoadMore && state.loadedCount > 0) {
        endMessage.classList.remove("is-hidden");
        hideStatus();
      } else {
        endMessage.classList.add("is-hidden");

        keepStatusVisible = true;

        showStatus("empty", "Chưa có bài viết nào.");
      }

      return;
    }

    // Render bài viết.
    posts.forEach((post, index) => {
      const node = createPostCard(post);
      const card = node.querySelector(".post-card");

      // Nếu là tải thêm: kích hoạt hiệu ứng xuất hiện gợn sóng mượt mà
      if (isLoadMore && card) {
        card.classList.add("post-card--entering");
        card.style.animationDelay = `${index * 55}ms`;
      }

      postList.appendChild(node);
    });

    // Nếu là tải thêm: cuộn màn hình mượt mà xuống để thấy các bài mới
    if (isLoadMore && posts.length > 0) {
      setTimeout(() => {
        window.scrollBy({
          top: 140,
          behavior: "smooth",
        });
      }, 100);
    }

    // Kiểm tra còn bài viết để tải hay không.
    const hasMore = state.loadedCount < state.total;

    loadMoreBtn.classList.toggle("is-hidden", !hasMore);

    endMessage.classList.toggle("is-hidden", hasMore);

  } catch (error) {
    // Bỏ qua lỗi do chủ động hủy request.
    if (
      axios.isCancel(error) ||
      error.code === "ERR_CANCELED"
    ) {
      return;
    }

    console.error("Lỗi khi tải danh sách bài viết:", error);

    keepStatusVisible = true;

    if (isLoadMore) {
      loadMoreBtn.classList.add("is-hidden");
    }

    showStatus(
      "error",
      error.userMessage ||
        "Không thể tải danh sách bài viết. Vui lòng thử lại.",
      true
    );

  } finally {
    // Chỉ request mới nhất được phép cập nhật trạng thái giao diện.
    if (postsController === controller) {
      if (!isLoadMore) {
        if (!keepStatusVisible) {
          hideStatus();
        }
      }

      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = "Tải thêm";

      postsController = null;
    }
  }
}

// ============================================================
// 11. MỨC 2 – TẢI DANH SÁCH TAG
// ============================================================

/**
 * Lấy danh sách tag từ API và đưa vào select.
 */
async function loadTags() {
  try {
    const response = await api.get("/posts/tags");

    const tags = response.data;

    tags.forEach((tag) => {
      const option = document.createElement("option");

      option.value = tag.slug;
      option.textContent = tag.name;

      tagSelect.appendChild(option);
    });

  } catch (error) {
    console.error("Lỗi khi tải danh sách tag:", error);
  }
}

// ============================================================
// 12. MỨC 2 – RESET VÀ TẢI LẠI
// ============================================================

/**
 * Reset trạng thái phân trang và tải lại từ đầu.
 */
function resetAndReload() {
  state.loadedCount = 0;
  state.total = 0;

  loadMoreBtn.classList.add("is-hidden");
  endMessage.classList.add("is-hidden");

  loadPosts(false);
}

// ============================================================
// 13. MỨC 2 – DEBOUNCE
// ============================================================

/**
 * Chỉ thực thi callback sau khi ngừng gọi hàm trong một khoảng thời gian.
 *
 * @param {Function} callback Hàm cần trì hoãn.
 * @param {number} delay Thời gian chờ (ms).
 * @returns {Function} Hàm đã được debounce.
 */
function debounce(callback, delay) {
  let timerId;

  const debounced = (...args) => {
    clearTimeout(timerId);

    timerId = setTimeout(() => {
      callback(...args);
    }, delay);
  };

  // Cho phép hủy timer khi cần.
  debounced.cancel = () => {
    clearTimeout(timerId);
  };

  return debounced;
}

// ============================================================
// 14. MỨC 2 – XỬ LÝ TÌM KIẾM
// ============================================================

/**
 * Lấy keyword từ input và tải lại danh sách.
 */
function applySearch() {
  state.keyword = keywordInput.value.trim();

  resetAndReload();
}

// Tạo hàm tìm kiếm có debounce 400ms.
const handleSearch = debounce(() => {
  applySearch();
}, DEBOUNCE_MS);

// Người dùng nhập thì gọi handleSearch.
keywordInput.addEventListener("input", handleSearch);

// Khi submit form thì tìm kiếm ngay.
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();

  handleSearch.cancel();

  applySearch();
});

// ============================================================
// 15. MỨC 2 – XỬ LÝ LỌC TAG
// ============================================================

tagSelect.addEventListener("change", () => {
  state.tag = tagSelect.value;

  resetAndReload();
});

// ============================================================
// 16. MỨC 2 – XỬ LÝ SẮP XẾP
// ============================================================

sortSelect.addEventListener("change", () => {
  state.sort = sortSelect.value;

  resetAndReload();
});

// ============================================================
// 17. MỨC 2 – XỬ LÝ NÚT LOAD MORE VÀ RETRY
// ============================================================

// Click Load More thì tải tiếp, không xóa danh sách cũ.
loadMoreBtn.addEventListener("click", () => {
  loadPosts(true);
});

// Retry tải lại đúng kiểu request bị lỗi.
retryBtn.addEventListener("click", () => {
  loadPosts(lastLoadWasLoadMore);
});

// ============================================================
// 18. MỨC 3 – CACHE THÔNG TIN TÁC GIẢ BẰNG MAP
// ============================================================

/**
 * Lấy thông tin tác giả.
 *
 * Cache cả Promise đang chạy để tránh gửi nhiều request
 * nếu cùng một tác giả được yêu cầu liên tục.
 *
 * @param {number|string} userId ID người dùng.
 * @returns {Promise<object>} Thông tin người dùng.
 */
async function getUser(userId) {
  // Chuẩn hóa ID để tránh key "1" và key 1 khác nhau.
  const cacheKey = String(userId);

  // Nếu đã có trong cache thì dùng lại Promise.
  if (userCache.has(cacheKey)) {
    return userCache.get(cacheKey);
  }

  // Tạo Promise gọi API.
  const userPromise = api
    .get(`/users/${cacheKey}`)
    .then((response) => response.data)
    .catch((error) => {
      // Nếu request lỗi thì xóa cache để lần sau có thể thử lại.
      userCache.delete(cacheKey);

      throw error;
    });

  // Lưu Promise vào Map ngay khi bắt đầu request.
  userCache.set(cacheKey, userPromise);

  return userPromise;
}

// ============================================================
// 19. MỨC 3 – MỞ CHI TIẾT BÀI VIẾT
// ============================================================

/**
 * Mở dialog và tải thông tin bài viết, tác giả, bình luận.
 *
 * @param {string} postId ID bài viết.
 * @param {string} userId ID tác giả.
 * @param {HTMLElement|null} cardElement Thẻ bài viết vừa được bấm.
 */
async function openPostDialog(postId, userId, cardElement = null) {
  // Lưu lại vị trí cuộn trang hiện tại và thẻ bài viết
  savedScrollY = window.scrollY || document.documentElement.scrollTop;
  if (cardElement) {
    lastClickedCard = cardElement;
  }

  // Lưu ID bài viết hiện tại.
  currentPostId = String(postId);

  // Tạo mã request mới để nhận biết request cũ.
  const requestId = ++postDetailRequestId;

  // Hiển thị nội dung tạm thời.
  dialogTitle.textContent = "Đang tải bài viết...";
  dialogTags.replaceChildren();
  dialogBody.textContent = "Vui lòng chờ...";

  dialogAuthorName.textContent = `Tác giả #${userId}`;
  dialogAuthorAvatar.src = DEFAULT_AVATAR;
  dialogAuthorAvatar.alt = `Tác giả #${userId}`;
  dialogAuthorAvatar.onerror = () => {
    dialogAuthorAvatar.src = DEFAULT_AVATAR;
  };

  // Mở dialog.
  dialog.classList.remove("dialog--closing");
  if (!dialog.open) {
    dialog.showModal();

    // Giữ nguyên toạ độ cuộn trang, chống trình duyệt tự nhảy lên đầu trang
    window.scrollTo({
      top: savedScrollY,
      left: 0,
      behavior: "instant",
    });
  }

  // Khóa chống click nhầm trong 400ms đầu tiên khi hộp thoại vừa mở
  isOpeningDialog = true;
  setTimeout(() => {
    isOpeningDialog = false;
  }, 400);

  // Tải bình luận độc lập với chi tiết bài viết.
  loadComments(postId);

  // Lấy bài viết và tác giả song song.
  const results = await Promise.allSettled([
    api.get(`/posts/${postId}`),
    getUser(userId),
  ]);

  // Không cập nhật nếu người dùng đã chuyển bài viết hoặc đóng dialog.
  if (
    requestId !== postDetailRequestId ||
    currentPostId !== String(postId) ||
    !dialog.open
  ) {
    return;
  }

  const [postResult, userResult] = results;

  // Xử lý kết quả lấy bài viết.
  if (postResult.status === "fulfilled") {
    const post = postResult.value.data;

    dialogTitle.textContent = post.title;
    dialogBody.textContent = post.body;

    // Hiển thị tag đẹp mắt dạng badge
    dialogTags.replaceChildren();
    if (post.tags && post.tags.length > 0) {
      post.tags.forEach((tag) => {
        const tagElement = document.createElement("li");
        tagElement.classList.add("tag");
        tagElement.textContent = tag;
        dialogTags.appendChild(tagElement);
      });
    }
  } else {
    dialogTitle.textContent = "Không thể tải bài viết.";

    dialogBody.textContent =
      postResult.reason?.userMessage ||
      "Vui lòng đóng hộp thoại và thử lại.";

    console.error(
      "Lỗi lấy chi tiết bài viết:",
      postResult.reason
    );
  }

  // Xử lý kết quả lấy tác giả độc lập.
  if (userResult.status === "fulfilled") {
    const user = userResult.value;

    dialogAuthorName.textContent =
      `${user.firstName} ${user.lastName}`.trim();

    dialogAuthorAvatar.src = user.image || DEFAULT_AVATAR;
    dialogAuthorAvatar.alt = `${user.firstName} ${user.lastName}`.trim();
  } else {
    dialogAuthorName.textContent = `Tác giả #${userId}`;
    dialogAuthorAvatar.src = DEFAULT_AVATAR;

    console.error(
      "Lỗi lấy thông tin tác giả:",
      userResult.reason
    );
  }
}

// ============================================================
// 20. MỨC 3 – HIỆU ỨNG VÀ SỰ KIỆN CLICK BÀI VIẾT
// ============================================================

/**
 * Tạo hiệu ứng sóng xung kích neon công nghệ (Cyber Ripple) khi bấm vào thẻ.
 *
 * @param {MouseEvent} event Sự kiện click.
 * @param {HTMLElement} card Thẻ bài viết được click.
 */
function createCyberRipple(event, card) {
  if (!event || typeof event.clientX !== "number") {
    return;
  }

  const rect = card.getBoundingClientRect();
  const ripple = document.createElement("span");
  ripple.className = "cyber-ripple";

  const size = Math.max(rect.width, rect.height) * 1.8;
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  card.appendChild(ripple);

  ripple.addEventListener("animationend", () => {
    ripple.remove();
  });
}

// Event delegation: lắng nghe click mở bài viết.
postList.addEventListener("click", (event) => {
  const card = event.target.closest(".post-card");

  if (!card || !postList.contains(card)) {
    return;
  }

  // Bỏ qua bài viết mẫu trong HTML.
  if (card.hasAttribute("data-sample")) {
    return;
  }

  const postId = card.dataset.postId;
  const userId = card.dataset.userId;

  if (!postId || !userId) {
    return;
  }

  // Hiệu ứng sóng neon phản hồi click
  createCyberRipple(event, card);
  card.classList.add("post-card--clicked");
  setTimeout(() => {
    card.classList.remove("post-card--clicked");
  }, 400);

  openPostDialog(postId, userId, card);
});

// Hỗ trợ mở bài viết bằng bàn phím Enter hoặc Space.
postList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const card = event.target.closest(".post-card");

  if (!card || !postList.contains(card)) {
    return;
  }

  if (card.hasAttribute("data-sample")) {
    return;
  }

  event.preventDefault();

  const postId = card.dataset.postId;
  const userId = card.dataset.userId;

  if (!postId || !userId) {
    return;
  }

  card.classList.add("post-card--clicked");
  setTimeout(() => {
    card.classList.remove("post-card--clicked");
  }, 400);

  openPostDialog(postId, userId, card);
});

// ============================================================
// 21. MỨC 3 – ĐÓNG DIALOG VỚI ANIMATION HOLOGRAPHIC
// ============================================================

// Biến kiểm soát trạng thái để chống vô tình đóng hộp thoại do di chuột / click nhầm
let isMouseDownOnBackdrop = false;
let isOpeningDialog = false;

/**
 * Đóng dialog kèm hiệu ứng giải phóng hình chiếu (Holographic De-materialize).
 */
function closePostDialog() {
  if (!dialog.open || dialog.classList.contains("dialog--closing")) {
    return;
  }

  dialog.classList.add("dialog--closing");

  const onAnimationEnd = (event) => {
    // Chỉ xử lý khi đúng animation cyberHoloOut của chính thẻ dialog kết thúc
    if (event.target !== dialog || event.animationName !== "cyberHoloOut") {
      return;
    }

    dialog.removeEventListener("animationend", onAnimationEnd);
    dialog.classList.remove("dialog--closing");
    if (dialog.open) {
      dialog.close();
    }
    restoreScrollPosition();
  };

  dialog.addEventListener("animationend", onAnimationEnd);

  // Fallback an toàn nếu sự kiện animationend không kích hoạt
  setTimeout(() => {
    if (dialog.open && dialog.classList.contains("dialog--closing")) {
      dialog.classList.remove("dialog--closing");
      dialog.close();
      restoreScrollPosition();
    }
  }, 280);
}

// Đóng bằng nút X.
dialogClose.addEventListener("click", (event) => {
  event.stopPropagation();
  closePostDialog();
});

// Chỉ ghi nhận mousedown khi chuột bấm thực sự ra ngoài khung hộp thoại
dialog.addEventListener("mousedown", (event) => {
  if (isOpeningDialog) {
    isMouseDownOnBackdrop = false;
    return;
  }

  const rect = dialog.getBoundingClientRect();
  const isOutside =
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom;

  isMouseDownOnBackdrop = (event.target === dialog && isOutside);
});

// Đóng khi click bên ngoài nội dung dialog (yêu cầu cả mousedown và click đều ở ngoài)
dialog.addEventListener("click", (event) => {
  if (isOpeningDialog) {
    return;
  }

  const rect = dialog.getBoundingClientRect();
  const isOutside =
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom;

  if (event.target === dialog && isOutside && isMouseDownOnBackdrop) {
    closePostDialog();
  }

  isMouseDownOnBackdrop = false;
});

// Bắt sự kiện Escape để chạy hiệu ứng đóng mượt mà
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closePostDialog();
});

// Sự kiện close được kích hoạt cả khi đóng bằng Escape hoặc script.
dialog.addEventListener("close", () => {
  dialog.classList.remove("dialog--closing");

  // Hủy hiệu lực các request chi tiết cũ.
  postDetailRequestId++;

  currentPostId = null;

  // Hủy request bình luận nếu vẫn đang tải.
  if (commentController) {
    commentController.abort();
  }

  // Khôi phục chính xác vị trí cuộn trang của bài viết đang xem
  restoreScrollPosition();
});

// ============================================================
// 22. MỨC 3 – HIỂN THỊ TRẠNG THÁI BÌNH LUẬN
// ============================================================

/**
 * Hiển thị trạng thái của khu vực bình luận.
 *
 * @param {string} message Nội dung thông báo.
 * @param {boolean} withRetry Có hiển thị nút Retry hay không.
 */
function showCommentStatus(message, withRetry = false) {
  commentStatus.classList.remove("is-hidden");

  commentStatusText.textContent = message;

  commentRetryBtn.classList.toggle("is-hidden", !withRetry);
}

/**
 * Ẩn trạng thái của khu vực bình luận.
 */
function hideCommentStatus() {
  commentStatus.classList.add("is-hidden");
}

// ============================================================
// 23. MỨC 3 – TẠO MỘT PHẦN TỬ BÌNH LUẬN
// ============================================================

/**
 * Tạo một phần tử bình luận từ template.
 *
 * @param {object} comment Object bình luận từ API.
 * @returns {HTMLElement} Phần tử li.comment.
 */
function createCommentElement(comment) {
  const node = commentTemplate.content.cloneNode(true);

  const commentElement = node.querySelector(".comment");

  // Lấy tên người bình luận.
  const authorName =
    comment.user?.fullName ||
    comment.user?.username ||
    "Người dùng";

  commentElement.querySelector(".comment__author").textContent =
    authorName;

  // Hiển thị nội dung.
  commentElement.querySelector(".comment__body").textContent =
    comment.body;

  // Hiển thị lượt thích.
  commentElement.querySelector(".comment__likes").textContent =
    `❤️ ${comment.likes ?? 0}`;

  return commentElement;
}

// ============================================================
// 24. MỨC 3 – RENDER DANH SÁCH BÌNH LUẬN
// ============================================================

/**
 * Render danh sách bình luận.
 *
 * @param {Array} comments Mảng bình luận từ API.
 */
function renderComments(comments) {
  commentList.replaceChildren();

  const fragment = document.createDocumentFragment();

  comments.forEach((comment) => {
    fragment.appendChild(createCommentElement(comment));
  });

  commentList.appendChild(fragment);
}

// ============================================================
// 25. MỨC 3 – TẢI BÌNH LUẬN
// ============================================================

/**
 * Tải bình luận của một bài viết.
 *
 * @param {number|string} postId ID bài viết.
 */
async function loadComments(postId) {
  // Hủy request bình luận cũ nếu còn đang chạy.
  if (commentController) {
    commentController.abort();
  }

  // Tạo controller cho request mới.
  const controller = new AbortController();
  commentController = controller;

  // Xóa bình luận cũ.
  commentList.replaceChildren();

  // Hiển thị loading.
  showCommentStatus("Đang tải bình luận...");

  // Reset số lượng.
  commentCount.textContent = "0";

  try {
    const response = await api.get(`/posts/${postId}/comments`, {
      signal: controller.signal,
    });

    // Bỏ qua response nếu đã chuyển sang bài viết khác.
    if (
      currentPostId !== String(postId) ||
      commentController !== controller
    ) {
      return;
    }

    const comments = response.data.comments;

    commentCount.textContent = comments.length;

    // Không có bình luận.
    if (comments.length === 0) {
      showCommentStatus("Bài viết chưa có bình luận nào.");
      return;
    }

    // Render bình luận.
    renderComments(comments);

    hideCommentStatus();

  } catch (error) {
    // Không hiển thị lỗi nếu request bị hủy.
    if (
      axios.isCancel(error) ||
      error.code === "ERR_CANCELED"
    ) {
      return;
    }

    console.error("Lỗi khi tải bình luận:", error);

    // Chỉ hiển thị lỗi cho bài viết đang mở.
    if (
      currentPostId === String(postId) &&
      commentController === controller
    ) {
      showCommentStatus(
        error.userMessage ||
          "Không thể tải bình luận. Vui lòng thử lại.",
        true
      );
    }

  } finally {
    // Chỉ request mới nhất được phép giải phóng controller.
    if (commentController === controller) {
      commentController = null;
    }
  }
}

// Nút Retry của khu vực bình luận.
commentRetryBtn.addEventListener("click", () => {
  if (!currentPostId) {
    return;
  }

  loadComments(currentPostId);
});

// ============================================================
// 26. MỨC 3 – GỬI BÌNH LUẬN BẰNG POST
// ============================================================

commentForm.addEventListener("submit", async (event) => {
  // Ngăn form tải lại trang.
  event.preventDefault();

  // Chống gửi nhiều lần.
  if (isSubmittingComment) {
    return;
  }

  // Lấy nội dung bình luận.
  const body = commentInput.value.trim();

  // Lưu ID bài viết tại thời điểm gửi.
  const submittedPostId = currentPostId;

  // Kiểm tra dữ liệu.
  if (!body || !submittedPostId) {
    return;
  }

  // Kiểm tra độ dài.
  if (body.length > MAX_COMMENT_LENGTH) {
    commentFormError.textContent =
      `Bình luận không được vượt quá ${MAX_COMMENT_LENGTH} ký tự.`;

    commentFormError.classList.remove("is-hidden");

    return;
  }

  // Bật trạng thái đang gửi.
  isSubmittingComment = true;

  commentSubmit.disabled = true;
  commentSubmit.textContent = "Đang gửi...";

  // Xóa lỗi cũ.
  commentFormError.textContent = "";
  commentFormError.classList.add("is-hidden");

  try {
    // Gửi POST request.
    const response = await api.post("/comments/add", {
      body: body,
      postId: Number(submittedPostId),
      userId: CURRENT_USER_ID,
    });

    // Chỉ cập nhật nếu vẫn đang mở đúng bài viết.
    if (
      currentPostId !== submittedPostId ||
      !dialog.open
    ) {
      return;
    }

    // Lấy bình luận mới từ API.
    const newComment = response.data;

    // Thêm bình luận vào cuối danh sách.
    commentList.appendChild(
      createCommentElement(newComment)
    );

    // Ẩn trạng thái empty/loading cũ.
    hideCommentStatus();

    // Cập nhật số lượng bình luận.
    commentCount.textContent = commentList.children.length;

    // Xóa nội dung sau khi gửi thành công.
    commentInput.value = "";

  } catch (error) {
    console.error("Lỗi khi gửi bình luận:", error);

    // Chỉ báo lỗi nếu vẫn đang mở đúng bài viết.
    if (
      currentPostId === submittedPostId &&
      dialog.open
    ) {
      commentFormError.textContent =
        error.userMessage ||
        "Không thể gửi bình luận. Vui lòng thử lại.";

      commentFormError.classList.remove("is-hidden");
    }

  } finally {
    // Khôi phục trạng thái gửi.
    isSubmittingComment = false;

    commentSubmit.disabled = false;
    commentSubmit.textContent = "Gửi";
  }
});

// ============================================================
// 27. KHỞI ĐỘNG ỨNG DỤNG
// ============================================================

// Xóa hai bài viết mẫu trong HTML nếu còn tồn tại.
postList.querySelectorAll("[data-sample]").forEach((card) => {
  card.remove();
});

// Tải danh sách tag.
loadTags();

// Tải 10 bài viết đầu tiên.
loadPosts(false);
