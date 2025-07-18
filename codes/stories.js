// stories.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// UI Elements - Declared at the top to ensure they are accessible before any Firebase logic
const postContentInput = document.getElementById('postContentInput');
const postImageInput = document.getElementById('postImageInput');
const createPostBtn = document.getElementById('createPostBtn');
const postMessageArea = document.getElementById('postMessageArea');
const storiesFeed = document.getElementById('storiesFeed');
const logoutBtn = document.getElementById('logoutBtn');

// Modal Elements
const overlay = document.getElementById('overlay');
const modalTitle = document.getElementById('modal-title');
const modalImg = document.getElementById('modal-img');
const modalDesc = document.getElementById('modal-desc'); // This will show post content in modal
const modalLikeBtn = document.getElementById('modalLikeBtn');
const modalCommentSection = document.getElementById('modal-comment-section');
const commentsDisplayArea = document.getElementById('comments-display-area');
const commentMessageArea = document.getElementById('comment-message-area');
const commentInput = document.getElementById('comment-input');
const submitCommentBtn = document.getElementById('submit-comment-btn');


// Determine appId from __app_id, which is provided by the Canvas environment.
// This is the most reliable source for the project ID in this context.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
console.log("App ID in use:", appId);

// Use Canvas-provided Firebase config directly, ensuring projectId and apiKey are always set.
let firebaseConfig = {};
const providedApiKey = "AIzaSyDoijFlD_hJ2mp4FstfSZO4qUPKIzEdmPs"; // User provided API Key
const providedProjectId = "hello-e7a6d"; // User provided Project ID

try {
  // Attempt to parse __firebase_config.
  if (typeof __firebase_config === 'string' && __firebase_config.trim() !== '') {
    const parsedConfig = JSON.parse(__firebase_config);
    // Validate if parsed config is an object and has projectId and apiKey.
    if (parsedConfig && typeof parsedConfig === 'object' && parsedConfig.projectId && parsedConfig.apiKey) {
      firebaseConfig = parsedConfig;
      console.log("Firebase Config: Using Canvas-provided config.");
    } else {
      // If parsed config is malformed or missing essential keys, log a warning.
      console.warn("Firebase Config: Canvas-provided config is malformed or missing essential keys (projectId/apiKey). Falling back to user-provided explicit config.");
      // Construct a fallback config using user-provided explicit values
      firebaseConfig = {
        apiKey: providedApiKey,
        authDomain: `${providedProjectId}.firebaseapp.com`,
        projectId: providedProjectId,
        storageBucket: `${providedProjectId}.appspot.com`,
        messagingSenderId: "dummy-messaging-sender-id", // Can be dummy
        appId: "dummy-app-id" // Can be dummy as appId is already defined above
      };
    }
  } else {
    // If __firebase_config is undefined, null, or empty.
    console.warn("Firebase Config: __firebase_config is undefined, null, or empty. Falling back to user-provided explicit config.");
    // Construct a fallback config using user-provided explicit values
    firebaseConfig = {
      apiKey: providedApiKey,
      authDomain: `${providedProjectId}.firebaseapp.com`,
      projectId: providedProjectId,
      storageBucket: `${providedProjectId}.appspot.com`,
      messagingSenderId: "dummy-messaging-sender-id",
      appId: "dummy-app-id"
    };
  }
} catch (e) {
  // Catch any parsing errors and fallback.
  console.error("Firebase Config: Error during parsing/validation of __firebase_config. Falling back to user-provided explicit config:", e);
  firebaseConfig = {
    apiKey: providedApiKey,
    authDomain: `${providedProjectId}.firebaseapp.com`,
    projectId: providedProjectId,
    storageBucket: `${providedProjectId}.appspot.com`,
    messagingSenderId: "dummy-messaging-sender-id",
    appId: "dummy-app-id"
  };
}
console.log("Firebase Config in use:", firebaseConfig);

// Check if essential Firebase config is still missing after all fallback attempts
// This check is primarily for logging and disabling UI, not to halt the script.
if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
    console.error("Firebase initialization warning: Essential firebaseConfig (projectId/apiKey) might be missing even after fallback. Ensure __firebase_config is correctly provided by the Canvas environment or the hardcoded values are correct. Firebase-dependent features will be disabled.");
    // Disable UI elements that depend on Firebase if config is clearly incomplete
    if (postContentInput) postContentInput.disabled = true;
    if (postImageInput) postImageInput.disabled = true;
    if (createPostBtn) createPostBtn.disabled = true;
    if (commentInput) commentInput.disabled = true;
    if (submitCommentBtn) submitCommentBtn.disabled = true;
    // Display a user-friendly message on the page
    if (postMessageArea) showMessage(postMessageArea, "Error: Hindi makakonekta sa database. Pakisuri ang configuration.", false);
}


// The initialAuthToken is still used if provided by the Canvas environment
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
console.log("Initial Auth Token status:", initialAuthToken ? "present" : "not present");

let app;
let db;
let auth;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (error) {
    console.error("Failed to initialize Firebase:", error);
    // Disable UI elements if Firebase initialization itself fails
    if (postContentInput) postContentInput.disabled = true;
    if (postImageInput) postImageInput.disabled = true;
    if (createPostBtn) createPostBtn.disabled = true;
    if (commentInput) commentInput.disabled = true;
    if (submitCommentBtn) submitCommentBtn.disabled = true;
    // Display a user-friendly message on the page
    if (postMessageArea) showMessage(postMessageArea, "Error: Hindi makakonekta sa database. Pakisuri ang configuration.", false);
    // Set dummy functions to prevent further errors
    db = null;
    auth = null;
}


let currentUserId = null; // To store the current user's UID
let currentUserName = null; // To store the current user's display name
let unsubscribePosts = null; // To manage real-time listener for posts
let unsubscribeComments = null; // To manage real-time listener for comments in modal

let currentOpenPostId = null; // Tracks the post ID currently open in the modal

// --- Helper Functions ---

function showMessage(element, message, isSuccess = false) {
  if (!element) return; // Ensure the element exists before trying to manipulate it
  element.textContent = message;
  element.classList.remove('success');
  if (isSuccess) {
    element.classList.add('success');
  }
  element.style.display = 'block';
  setTimeout(() => {
    element.textContent = '';
    element.style.display = 'none';
    element.classList.remove('success');
  }, 3000);
}

function getAvatarText(username) {
  if (!username) return 'Anon';
  const parts = username.split(' ');
  if (parts.length > 1) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username[0].toUpperCase();
}

// --- Firebase Authentication ---

// Only proceed with auth state changes if auth object is valid
if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUserId = user.uid;
      currentUserName = user.displayName || user.email || 'Anonymous';
      console.log(`User logged in: ${currentUserName} (${currentUserId})`);

      // Enable post creation and comment input
      if (postContentInput) postContentInput.disabled = false;
      if (postImageInput) postImageInput.disabled = false;
      if (createPostBtn) createPostBtn.disabled = false;
      if (commentInput) commentInput.disabled = false;
      if (submitCommentBtn) submitCommentBtn.disabled = false;

      if (postContentInput) postContentInput.placeholder = "Ano ang nasa isip mo? Ibahagi ang iyong kwento...";
      if (commentInput) commentInput.placeholder = "Isulat ang iyong komento...";

      // If there's a modal open, re-check like state and comments permissions
      if (currentOpenPostId && db) { // Check db before accessing it
        loadCommentsForPost(currentOpenPostId);
        // Re-evaluate like button state for the currently open modal post
        const postRef = doc(db, `artifacts/${appId}/public/data/posts`, currentOpenPostId);
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
          const postData = postSnap.data();
          updateModalLikeButton(postData.likes || []);
        }
      }

    } else {
      currentUserId = null;
      currentUserName = null;
      console.log('User logged out or not authenticated.');

      // Disable post creation and comment input
      if (postContentInput) postContentInput.disabled = true;
      if (postImageInput) postImageInput.disabled = true;
      if (createPostBtn) createPostBtn.disabled = true;
      if (commentInput) commentInput.disabled = true;
      if (submitCommentBtn) submitCommentBtn.disabled = true;

      if (postContentInput) postContentInput.placeholder = "Mangyaring mag-log in para mag-post.";
      if (commentInput) commentInput.placeholder = "Mangyaring mag-log in para mag-komento.";

      // Attempt anonymous sign-in if no custom token is present
      if (!initialAuthToken && auth) { // Check if auth is valid before attempting signInAnonymously
        try {
          await signInAnonymously(auth);
          console.log("Successfully signed in anonymously.");
        } catch (error) {
          console.error("Error signing in anonymously:", error);
        }
      }
    }
    // Reload posts to update edit/delete visibility
    loadPosts();
  });
}


// Initial sign-in attempt with custom token
document.addEventListener('DOMContentLoaded', async () => {
  if (initialAuthToken && auth) { // Check if auth is valid
    try {
      await signInWithCustomToken(auth, initialAuthToken);
      console.log("Successfully signed in with custom token.");
    } catch (error) {
      console.error("Error signing in with custom token:", error);
      console.log("Falling back to anonymous sign-in after custom token failure.");
      if (auth) { // Check if auth is valid before attempting signInAnonymously
        try {
          await signInAnonymously(auth);
          console.log("Successfully signed in anonymously after custom token failure.");
        } catch (anonError) {
          console.error("Error signing in anonymously after custom token failure:", anonError);
        }
      }
    }
  } else {
    console.log("No initialAuthToken, relying on onAuthStateChanged for anonymous sign-in.");
  }
});


// --- Post Creation ---

if (createPostBtn) { // Listener for createPostBtn
  createPostBtn.addEventListener('click', async () => {
    if (!currentUserId || !db) { // Check db as well
      showMessage(postMessageArea, "Mangyaring mag-log in at tiyakin na konektado ang database para mag-post.", false);
      return;
    }

    const content = postContentInput.value.trim();
    const imageFile = postImageInput.files[0];

    if (!content && !imageFile) {
      showMessage(postMessageArea, "Mangyaring maglagay ng text o pumili ng larawan.", false);
      return;
    }

    let imageUrl = null;
    if (imageFile) {
      // Read image as Base64 for storage in Firestore (not ideal for large images)
      const reader = new FileReader();
      reader.readAsDataURL(imageFile);
      reader.onload = async () => {
        imageUrl = reader.result;
        await savePostToFirestore(content, imageUrl);
      };
      reader.onerror = (error) => {
        console.error("Error reading file:", error);
        showMessage(postMessageArea, "Nabigo ang pag-upload ng larawan.", false);
      };
    } else {
      await savePostToFirestore(content, imageUrl);
    }
  });
}

async function savePostToFirestore(content, imageUrl) {
  if (!db) {
    console.error("Firestore database is not initialized.");
    showMessage(postMessageArea, "Database error. Hindi makapag-post.", false);
    return;
  }
  try {
    await addDoc(collection(db, `artifacts/${appId}/public/data/posts`), {
      userId: currentUserId,
      userName: currentUserName,
      content: content,
      imageUrl: imageUrl,
      timestamp: new Date(),
      likes: [], // Array of user UIDs who liked the post
      commentsCount: 0 // Count of comments
    });
    showMessage(postMessageArea, "Post naidagdag na!", true);
    if (postContentInput) postContentInput.value = '';
    if (postImageInput) postImageInput.value = ''; // Clear file input
  } catch (error) {
    console.error("Error adding post:", error);
    showMessage(postMessageArea, "Nabigo ang pagdagdag ng post. Subukang muli.", false);
  }
}

// --- Stories Feed Display ---

function loadPosts() {
  if (!db) {
    console.error("Firestore database is not initialized. Cannot load posts.");
    if (storiesFeed) storiesFeed.innerHTML = '<p class="message-area">Database error. Hindi ma-load ang mga kwento.</p>';
    return;
  }

  if (unsubscribePosts) {
    unsubscribePosts(); // Unsubscribe from previous listener if exists
  }

  const postsCollectionRef = collection(db, `artifacts/${appId}/public/data/posts`);
  const q = query(postsCollectionRef, orderBy('timestamp', 'desc')); // Order by newest first

  unsubscribePosts = onSnapshot(q, (snapshot) => {
    if (storiesFeed) storiesFeed.innerHTML = ''; // Clear current feed
    if (snapshot.empty) {
      if (storiesFeed) storiesFeed.innerHTML = '<p class="loading-message">Walang post pa. Maging una!</p>';
      return;
    }

    snapshot.forEach((doc) => {
      const post = { id: doc.id, ...doc.data() };
      renderPost(post);
    });
  }, (error) => {
    console.error("Error loading posts:", error);
    if (storiesFeed) storiesFeed.innerHTML = '<p class="message-area">Error loading stories.</p>';
  });
}

function renderPost(post) {
  const storyCard = document.createElement('div');
  storyCard.classList.add('story-card');
  storyCard.dataset.postId = post.id;

  const postDate = post.timestamp ? new Date(post.timestamp.toDate()).toLocaleString() : 'Unknown Date';
  const isOwner = currentUserId && post.userId === currentUserId;
  const likedByCurrentUser = currentUserId && (post.likes || []).includes(currentUserId);

  storyCard.innerHTML = `
    <div class="story-header">
      <div class="user-info">
        <div class="user-avatar">${getAvatarText(post.userName)}</div>
        <span class="username">${post.userName}</span>
      </div>
      <div class="post-actions">
        ${isOwner ? `<button class="edit-post-btn" data-post-id="${post.id}">Edit</button>` : ''}
        ${isOwner ? `<button class="delete-post-btn" data-post-id="${post.id}">Delete</button>` : ''}
      </div>
    </div>
    <div class="story-content">
      <p class="post-text">${post.content || ''}</p>
      ${post.imageUrl ? `<img src="${post.imageUrl}" alt="Post Image">` : ''}
    </div>
    <div class="story-footer">
      <button class="like-button ${likedByCurrentUser ? 'liked' : ''}" data-post-id="${post.id}">
        <i class="fas fa-heart"></i> <span class="like-count">${post.likes ? post.likes.length : 0}</span>
      </button>
      <button class="comment-toggle-button" data-post-id="${post.id}">
        Comments (${post.commentsCount || 0})
      </button>
    </div>
    <div class="comments-section" id="comments-section-${post.id}">
      <div class="comments-list"></div>
      <div class="comment-input-area">
        <textarea placeholder="Isulat ang iyong komento..." class="comment-input" ${currentUserId ? '' : 'disabled'}></textarea>
        <button class="submit-comment-btn" ${currentUserId ? '' : 'disabled'}>Isumite</button>
      </div>
    </div>
  `;

  if (storiesFeed) storiesFeed.prepend(storyCard); // Add new posts to the top

  // Attach event listeners for the new post card
  attachPostEventListeners(storyCard, post);
}

function attachPostEventListeners(storyCard, post) {
  // Like Button
  const likeButton = storyCard.querySelector('.like-button');
  if (likeButton) {
    likeButton.addEventListener('click', async () => {
      if (!currentUserId || !db) {
        showMessage(postMessageArea, "Mangyaring mag-log in at tiyakin na konektado ang database para mag-react.", false);
        return;
      }
      await toggleLike(post.id, currentUserId);
    });
  }

  // Comment Toggle Button
  const commentToggleButton = storyCard.querySelector('.comment-toggle-button');
  const commentsSection = storyCard.querySelector('.comments-section');
  if (commentToggleButton && commentsSection) {
    commentToggleButton.addEventListener('click', () => {
      commentsSection.classList.toggle('active');
      if (commentsSection.classList.contains('active')) {
        commentToggleButton.textContent = `Hide Comments (${post.commentsCount || 0})`;
        loadCommentsForPost(post.id, commentsSection.querySelector('.comments-list'));
      } else {
        commentToggleButton.textContent = `Comments (${post.commentsCount || 0})`;
      }
    });
  }

  // Submit Comment Button (within each post's comment section)
  const submitCommentBtnPost = commentsSection.querySelector('.submit-comment-btn');
  const commentInputPost = commentsSection.querySelector('.comment-input');
  if (submitCommentBtnPost) { // Removed check for commentInputPost here, as it's used inside
    submitCommentBtnPost.addEventListener('click', async () => {
      if (!currentUserId || !db) {
        showMessage(postMessageArea, "Mangyaring mag-log in at tiyakin na konektado ang database para mag-komento.", false);
        return;
      }
      const commentText = commentInputPost ? commentInputPost.value.trim() : '';
      if (commentText) {
        await addComment(post.id, commentText);
        if (commentInputPost) commentInputPost.value = '';
      } else {
        showMessage(postMessageArea, "Walang laman ang komento.", false);
      }
    });
  }

  // Edit Post Button
  const editPostBtn = storyCard.querySelector('.edit-post-btn');
  if (editPostBtn) {
    editPostBtn.addEventListener('click', () => {
      toggleEditMode(storyCard, post);
    });
  }

  // Delete Post Button
  const deletePostBtn = storyCard.querySelector('.delete-post-btn');
  if (deletePostBtn) {
    deletePostBtn.addEventListener('click', async () => {
      if (!db) {
        showMessage(postMessageArea, "Database error. Hindi makabura ng post.", false);
        return;
      }
      if (confirm("Sigurado ka bang gusto mong burahin ang post na ito?")) {
        await deletePost(post.id);
      }
    });
  }
}

// --- Like Functionality ---

async function toggleLike(postId, userId) {
  if (!db) {
    console.error("Firestore database is not initialized.");
    showMessage(postMessageArea, "Database error. Hindi makapag-react.", false);
    return;
  }
  const postRef = doc(db, `artifacts/${appId}/public/data/posts`, postId);
  try {
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const postData = postSnap.data();
      let likes = postData.likes || [];
      if (likes.includes(userId)) {
        // User already liked, so unlike
        likes = likes.filter(id => id !== userId);
        await updateDoc(postRef, { likes: likes });
      } else {
        // User hasn't liked, so like
        likes = [...likes, userId];
        await updateDoc(postRef, { likes: likes });
      }
    }
  } catch (error) {
    console.error("Error toggling like:", error);
    showMessage(postMessageArea, "Nabigo ang pag-react. Subukang muli.", false);
  }
}

// --- Comment Functionality (for posts in the feed) ---

async function addComment(postId, commentText) {
  if (!db) {
    console.error("Firestore database is not initialized.");
    showMessage(postMessageArea, "Database error. Hindi makapag-komento.", false);
    return;
  }
  try {
    await addDoc(collection(db, `artifacts/${appId}/public/data/comments`), {
      postId: postId,
      userId: currentUserId,
      userName: currentUserName,
      commentText: commentText,
      timestamp: new Date(),
      parentId: null // Top-level comment
    });

    // Increment commentsCount on the post
    const postRef = doc(db, `artifacts/${appId}/public/data/posts`, postId);
    await updateDoc(postRef, {
      commentsCount: (await getDoc(postRef)).data().commentsCount + 1
    });

    showMessage(postMessageArea, "Komento naidagdag na!", true);
  } catch (error) {
    console.error("Error adding comment:", error);
    showMessage(postMessageArea, "Nabigo ang pagdagdag ng komento. Subukang muli.", false);
  }
}

function loadCommentsForPost(postId, commentsListElement) {
  if (!db) {
    console.error("Firestore database is not initialized. Cannot load comments.");
    if (commentsListElement) commentsListElement.innerHTML = '<p class="message-area">Database error. Hindi ma-load ang mga komento.</p>';
    return;
  }

  // Clear previous comments and unsubscribe if any
  if (commentsListElement) {
    commentsListElement.innerHTML = '<p style="text-align: center; color: #aaa;">Loading comments...</p>';
  }

  // Unsubscribe previous listener if it was for a different post or if called again for the same post
  if (unsubscribeComments) {
    unsubscribeComments(); // Unsubscribe from previous listener if exists
  }

  const commentsRef = collection(db, `artifacts/${appId}/public/data/comments`);
  const q = query(commentsRef); // Fetch all comments, then filter by postId in client

  unsubscribeComments = onSnapshot(q, (snapshot) => {
    const commentsForThisPost = [];
    snapshot.forEach(doc => {
      const comment = { id: doc.id, ...doc.data() };
      if (comment.postId === postId) {
        commentsForThisPost.push(comment);
      }
    });

    // Build hierarchical comments
    const commentsById = new Map();
    const rootComments = [];

    commentsForThisPost.forEach(comment => {
      commentsById.set(comment.id, comment);
      if (!comment.parentId) {
        rootComments.push(comment);
      }
    });

    commentsById.forEach(comment => {
      if (comment.parentId) {
        const parent = commentsById.get(comment.parentId);
        if (parent) {
          if (!parent.replies) {
            parent.replies = [];
          }
          parent.replies.push(comment);
        }
      }
    });

    // Sort comments by timestamp
    rootComments.sort((a, b) => (a.timestamp && b.timestamp) ? a.timestamp.toDate() - b.timestamp.toDate() : 0);

    if (commentsListElement) {
      commentsListElement.innerHTML = ''; // Clear existing comments before rendering
      if (rootComments.length > 0) {
        rootComments.forEach(comment => {
          renderComment(comment, commentsListElement);
        });
      } else {
        commentsListElement.innerHTML = '<p style="text-align: center; color: #aaa;">Walang komento pa. Maging una!</p>';
      }
    }
  }, (error) => {
    console.error("Error loading comments for post:", error);
    if (commentsListElement) {
      commentsListElement.innerHTML = '<p class="message-area">Error loading comments.</p>';
    }
  });
}

function renderComment(comment, parentElement) {
  const commentItem = document.createElement('div');
  commentItem.classList.add('comment-item');

  // Apply indentation and "tali" if it's a reply (i.e., has a parentId)
  if (comment.parentId) {
    commentItem.style.marginLeft = '20px'; // Fixed indentation for all replies
    commentItem.style.borderLeft = '2px solid #ffb300'; // Add "tali" directly to the comment item
    commentItem.style.paddingLeft = '15px'; // Space for the "tali"
  }

  const commentDate = comment.timestamp ? new Date(comment.timestamp.toDate()).toLocaleString() : 'Unknown Date';
  const isCommentOwner = currentUserId && comment.userId === currentUserId;

  commentItem.innerHTML = `
    <strong>${comment.userName || 'Anonymous'}</strong> <span style="font-size: 0.8em; color: #888;">(${commentDate})</span>
    <p>${comment.commentText}</p>
    <button class="reply-button" data-comment-id="${comment.id}">Reply</button>
    ${isCommentOwner ? `<button class="delete-comment-btn" data-comment-id="${comment.id}" data-post-id="${comment.postId}">Delete</button>` : ''}
  `;
  parentElement.appendChild(commentItem);

  // Event listener for reply button
  const replyButton = commentItem.querySelector('.reply-button');
  if (replyButton) {
    replyButton.addEventListener('click', () => {
      // Remove any existing reply input for this comment
      const existingReplyInput = commentItem.querySelector('.reply-input-area');
      if (existingReplyInput) {
        existingReplyInput.remove();
      } else {
        showReplyInputForComment(commentItem, comment.id, comment.postId);
      }
    });
  }

  // Event listener for delete comment button
  const deleteCommentBtn = commentItem.querySelector('.delete-comment-btn');
  if (deleteCommentBtn) {
    deleteCommentBtn.addEventListener('click', async () => {
      if (!db) {
        showMessage(postMessageArea, "Database error. Hindi makabura ng komento.", false);
        return;
      }
      if (confirm("Sigurado ka bang gusto mong burahin ang komentong ito?")) {
        await deleteComment(comment.id, comment.postId);
      }
    });
  }

  // Handle replies recursively
  if (comment.replies && comment.replies.length > 0) {
    const repliesContainer = document.createElement('div');
    repliesContainer.classList.add('replies-container', 'hidden-replies');

    const showRepliesButton = document.createElement('button');
    showRepliesButton.classList.add('show-replies-button');
    showRepliesButton.textContent = `Show Replies (${comment.replies.length})`;
    showRepliesButton.addEventListener('click', () => {
      repliesContainer.classList.toggle('hidden-replies');
      if (repliesContainer.classList.contains('hidden-replies')) {
        showRepliesButton.textContent = `Show Replies (${comment.replies.length})`;
      } else {
        showRepliesButton.textContent = `Hide Replies (${comment.replies.length})`;
      }
    });
    commentItem.appendChild(showRepliesButton);

    comment.replies.sort((a, b) => (a.timestamp && b.timestamp) ? a.timestamp.toDate() - b.timestamp.toDate() : 0);
    comment.replies.forEach(reply => {
      renderComment(reply, repliesContainer);
    });
    commentItem.appendChild(repliesContainer);
  }
}

function showReplyInputForComment(commentElement, parentCommentId, postId) {
  if (!db) {
    console.error("Firestore database is not initialized.");
    showMessage(postMessageArea, "Database error. Hindi makapag-reply.", false);
    return;
  }
  const replyInputArea = document.createElement('div');
  replyInputArea.classList.add('comment-input-area', 'reply-input-area');
  replyInputArea.style.marginLeft = '0px'; // No extra margin, it's already inside an indented commentItem
  replyInputArea.style.borderLeft = '2px solid #ffb300';
  replyInputArea.style.paddingLeft = '15px';

  const textarea = document.createElement('textarea');
  textarea.placeholder = "Isulat ang iyong reply...";
  textarea.disabled = !currentUserId;

  const submitButton = document.createElement('button');
  submitButton.textContent = "Reply";
  submitButton.disabled = !currentUserId;

  submitButton.addEventListener('click', async () => {
    const replyText = textarea.value.trim();
    if (replyText) {
      if (!db) { // Double check db before addDoc
        showMessage(postMessageArea, "Database error. Hindi makapag-reply.", false);
        return;
      }
      try {
        await addDoc(collection(db, `artifacts/${appId}/public/data/comments`), {
          postId: postId,
          userId: currentUserId,
          userName: currentUserName,
          commentText: replyText,
          timestamp: new Date(),
          parentId: parentCommentId
        });
        // Increment commentsCount on the post
        const postRef = doc(db, `artifacts/${appId}/public/data/posts`, postId);
        await updateDoc(postRef, {
          commentsCount: (await getDoc(postRef)).data().commentsCount + 1
        });

        showMessage(postMessageArea, "Reply naidagdag na!", true);
        replyInputArea.remove(); // Remove the input after submission
      } catch (error) {
        console.error("Error adding reply:", error);
        showMessage(postMessageArea, "Nabigo ang pagdagdag ng reply. Subukang muli.", false);
      }
    } else {
      showMessage(postMessageArea, "Walang laman ang reply.", false);
    }
  });

  replyInputArea.appendChild(textarea);
  replyInputArea.appendChild(submitButton);
  commentElement.appendChild(replyInputArea);
  textarea.focus();
}

async function deleteComment(commentId, postId) {
  if (!db) {
    console.error("Firestore database is not initialized.");
    showMessage(postMessageArea, "Database error. Hindi makabura ng komento.", false);
    return;
  }
  try {
    await deleteDoc(doc(db, `artifacts/${appId}/public/data/comments`, commentId));

    // Decrement commentsCount on the post
    const postRef = doc(db, `artifacts/${appId}/public/data/posts`, postId);
    const postSnap = await getDoc(postRef);
    if (postSnap.exists() && postSnap.data().commentsCount > 0) {
      await updateDoc(postRef, {
        commentsCount: postSnap.data().commentsCount - 1
      });
    }

    showMessage(postMessageArea, "Komento nabura na!", true);
  } catch (error) {
    console.error("Error deleting comment:", error);
    showMessage(postMessageArea, "Nabigo ang pagbura ng komento.", false);
  }
}


// --- Edit/Delete Post Functionality ---

function toggleEditMode(storyCard, post) {
  if (!db) {
    console.error("Firestore database is not initialized.");
    showMessage(postMessageArea, "Database error. Hindi makapag-edit ng post.", false);
    return;
  }
  const postTextElement = storyCard.querySelector('.post-text');
  const postImageElement = storyCard.querySelector('.story-content img');
  const postActions = storyCard.querySelector('.post-actions');

  if (postTextElement.dataset.editing === 'true') {
    // Save changes
    const newContent = postTextElement.value.trim();
    updatePost(post.id, { content: newContent });
    postTextElement.outerHTML = `<p class="post-text">${newContent}</p>`; // Replace textarea with p
    postTextElement.dataset.editing = 'false';
    postActions.innerHTML = `
      <button class="edit-post-btn" data-post-id="${post.id}">Edit</button>
      <button class="delete-post-btn" data-post-id="${post.id}">Delete</button>
    `;
    attachPostEventListeners(storyCard, post); // Re-attach listeners
  } else {
    // Enter edit mode
    const currentContent = postTextElement.textContent;
    const textarea = document.createElement('textarea');
    textarea.classList.add('post-text');
    textarea.value = currentContent;
    textarea.style.width = '100%';
    textarea.style.minHeight = '100px';
    textarea.style.padding = '10px';
    textarea.style.border = '1px solid #ddd';
    textarea.style.borderRadius = '8px';
    textarea.style.fontSize = '1em';
    textarea.style.marginBottom = '15px';
    textarea.style.boxSizing = 'border-box';
    textarea.dataset.editing = 'true'; // Mark as editing

    postTextElement.replaceWith(textarea);

    postActions.innerHTML = `
      <button class="save-post-btn" data-post-id="${post.id}">Save</button>
      <button class="cancel-edit-btn" data-post-id="${post.id}">Cancel</button>
    `;

    // Attach listeners for new buttons
    storyCard.querySelector('.save-post-btn').addEventListener('click', () => {
      const updatedContent = textarea.value.trim();
      updatePost(post.id, { content: updatedContent });
      textarea.outerHTML = `<p class="post-text">${updatedContent}</p>`;
      textarea.dataset.editing = 'false';
      postActions.innerHTML = `
        <button class="edit-post-btn" data-post-id="${post.id}">Edit</button>
        <button class="delete-post-btn" data-post-id="${post.id}">Delete</button>
      `;
      attachPostEventListeners(storyCard, post);
    });

    storyCard.querySelector('.cancel-edit-btn').addEventListener('click', () => {
      textarea.outerHTML = `<p class="post-text">${currentContent}</p>`; // Revert to original content
      textarea.dataset.editing = 'false';
      postActions.innerHTML = `
        <button class="edit-post-btn" data-post-id="${post.id}">Edit</button>
        <button class="delete-post-btn" data-post-id="${post.id}">Delete</button>
      `;
      attachPostEventListeners(storyCard, post);
    });
  }
}


async function updatePost(postId, updates) {
  if (!db) {
    console.error("Firestore database is not initialized.");
    showMessage(postMessageArea, "Database error. Hindi makapag-update ng post.", false);
    return;
  }
  const postRef = doc(db, `artifacts/${appId}/public/data/posts`, postId);
  try {
    await updateDoc(postRef, updates);
    showMessage(postMessageArea, "Post na-update na!", true);
  } catch (error) {
    console.error("Error updating post:", error);
    showMessage(postMessageArea, "Nabigo ang pag-update ng post.", false);
  }
}

async function deletePost(postId) {
  if (!db) {
    console.error("Firestore database is not initialized.");
    showMessage(postMessageArea, "Database error. Hindi makabura ng post.", false);
    return;
  }
  try {
    await deleteDoc(doc(db, `artifacts/${appId}/public/data/posts`, postId));

    // Delete associated comments (optional, but good practice for cleanup)
    const commentsRef = collection(db, `artifacts/${appId}/public/data/comments`);
    const q = query(commentsRef); // Fetch all comments to filter by postId

    const commentsToDelete = [];
    const snapshot = await getDocs(q); // Use getDocs to fetch once
    snapshot.forEach(doc => {
      if (doc.data().postId === postId) {
        commentsToDelete.push(deleteDoc(doc.ref));
      }
    });
    await Promise.all(commentsToDelete);

    showMessage(postMessageArea, "Post at mga komento nabura na!", true);
  } catch (error) {
    console.error("Error deleting post and comments:", error);
    showMessage(postMessageArea, "Nabigo ang pagbura ng post.", false);
  }
}

// --- Modal Functionality (for showing full post and comments) ---

// This function is called from stories.html when clicking on a post image or content
window.openOverlay = async (postId, content, imageUrl, userName, likes, commentsCount) => {
  currentOpenPostId = postId;
  if (modalTitle) modalTitle.textContent = `${userName}'s Post`;
  if (modalDesc) modalDesc.textContent = content; // Display post content in modalDesc

  if (modalImg) {
    if (imageUrl) {
      modalImg.src = imageUrl;
      modalImg.style.display = 'block';
    } else {
      modalImg.src = '';
      modalImg.style.display = 'none';
    }
  }


  // Update modal's like button state
  updateModalLikeButton(likes || []);

  // Show comments section in modal
  if (modalCommentSection) modalCommentSection.style.display = 'block';
  loadCommentsForPost(postId, commentsDisplayArea);

  if (overlay) overlay.style.display = 'flex';
};

window.closeOverlay = () => {
  if (overlay) overlay.style.display = 'none';
  currentOpenPostId = null;
  if (modalImg) modalImg.src = '';
  if (modalDesc) modalDesc.textContent = '';
  if (commentsDisplayArea) commentsDisplayArea.innerHTML = ''; // Clear comments
  if (commentInput) commentInput.value = ''; // Clear comment input
  if (commentMessageArea) commentMessageArea.textContent = ''; // Clear modal message
  if (commentMessageArea) commentMessageArea.style.display = 'none';
  if (modalCommentSection) modalCommentSection.style.display = 'none'; // Hide comments section

  if (unsubscribeComments) {
    unsubscribeComments(); // Unsubscribe comments listener when modal closes
    unsubscribeComments = null;
  }
};

// Update the modal's like button based on current user's like status
function updateModalLikeButton(likesArray) {
  if (!modalLikeBtn) return; // Ensure button exists
  const likedByCurrentUser = currentUserId && likesArray.includes(currentUserId);
  modalLikeBtn.classList.toggle('liked', likedByCurrentUser);
  const likeCountSpan = modalLikeBtn.querySelector('.like-count');
  if (likeCountSpan) {
    likeCountSpan.textContent = likesArray.length;
  }
}

// Event listener for modal's like button
if (modalLikeBtn) { // Removed db check here, as it's checked inside toggleLike
  modalLikeBtn.addEventListener('click', async () => {
    if (!currentUserId) { // Only check currentUserId here
      showMessage(commentMessageArea, "Mangyaring mag-log in para mag-react.", false);
      return;
    }
    if (currentOpenPostId) {
      await toggleLike(currentOpenPostId, currentUserId);
      // Re-fetch post data to update modal's like count and state immediately
      if (db) { // Check db before accessing it
        const postRef = doc(db, `artifacts/${appId}/public/data/posts`, currentOpenPostId);
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
          updateModalLikeButton(postSnap.data().likes || []);
        }
      }
    }
  });
}

// Event listener for modal's comment submit button
if (submitCommentBtn) { // Removed db check here, as it's checked inside addComment
  submitCommentBtn.addEventListener('click', async () => {
    if (!currentUserId) { // Only check currentUserId here
      showMessage(commentMessageArea, "Mangyaring mag-log in para mag-komento.", false);
      return;
    }
    const commentText = commentInput ? commentInput.value.trim() : '';
    if (commentText) {
      if (currentOpenPostId) {
        await addComment(currentOpenPostId, commentText);
        // No need to re-fetch post data for commentsCount here, loadCommentsForPost will update via onSnapshot
      }
    } else {
      showMessage(commentMessageArea, "Walang laman ang komento.", false);
    }
  });
}

// --- Logout Functionality ---
if (logoutBtn && auth) { // Ensure auth is valid
  logoutBtn.addEventListener("click", async () => {
    try {
      await auth.signOut();
      console.log("User signed out successfully.");
      // Redirect to login page or update UI
      window.location.href = "login.html";
    } catch (error) {
      console.error("Error signing out:", error);
      // Use custom modal instead of alert in production
      showMessage(postMessageArea, "Nabigo ang pag-logout. Subukang muli.", false);
    }
  });
}

// Initial load of posts when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadPosts();
});
document.addEventListener('DOMContentLoaded', () => {
  const burger = document.getElementById("burgerMenu");
  const dropdown = document.getElementById("dropdownMenu");

  if (burger && dropdown) {
    burger.addEventListener("click", () => {
      burger.classList.toggle("open");     // Rotate icon
      dropdown.classList.toggle("show");   // Toggle dropdown menu
    });
  } else {
    console.warn("Burger or Dropdown not found in DOM.");
  }
});
