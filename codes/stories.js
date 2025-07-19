// stories.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, getDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // Corrected import for firestore
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// UI Elements - Declared at the top to ensure they are accessible before any Firebase logic
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
const commentInput = document.getElementById('comment-input');
const submitCommentBtn = document.getElementById('submit-comment-btn');
const commentMessageArea = document.getElementById('comment-message-area');
const modalCloseBtn = document.getElementById('modal-close-btn');

// Determine appId from __app_id, which is provided by the Canvas environment.
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
    if (commentInput) commentInput.disabled = true;
    if (submitCommentBtn) submitCommentBtn.disabled = true;
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
    if (commentInput) commentInput.disabled = true;
    if (submitCommentBtn) submitCommentBtn.disabled = true;
    if (postMessageArea) showMessage(postMessageArea, "Error: Hindi makakonekta sa database. Pakisuri ang configuration.", false);
    db = null;
    auth = null;
}


let currentUserId = null; // To store the current user's UID
let currentUserName = null; // To store the current user's display name
let currentUserAvatarUrl = null; // To store the current user's avatar URL
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

// --- Firebase Authentication ---

// Only proceed with auth state changes if auth object is valid
if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUserId = user.uid;
      currentUserName = user.displayName || user.email || 'Anonymous';
      console.log(`User logged in: ${currentUserName} (${currentUserId})`);

      // Load user profile to get avatar URL and ensure username is updated
      const userRef = doc(db, `users`, currentUserId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        currentUserAvatarUrl = userData.avatarUrl || null;
        if (userData.username) currentUserName = userData.username; // Use custom username if available
      } else {
        // If user profile doesn't exist, create a basic one
        await updateDoc(userRef, {
          username: currentUserName,
          email: user.email || '',
          bio: "Hello, I'm new to Philippine Gaze!",
          createdAt: new Date(),
          avatarUrl: null // No avatar initially
        }, { merge: true });
      }

      // Enable comment input
      if (commentInput) commentInput.disabled = false;
      if (submitCommentBtn) submitCommentBtn.disabled = false;

      if (commentInput) commentInput.placeholder = "Isulat ang iyong komento...";

      // If there's a modal open, re-check like state and comments permissions
      if (currentOpenPostId && db) { // Check db before accessing it
        loadCommentsForPost(currentOpenPostId, commentsDisplayArea); // Pass commentsDisplayArea
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
      currentUserAvatarUrl = null; // Reset avatar URL on logout
      console.log('User logged out or not authenticated.');

      // Disable comment input
      if (commentInput) commentInput.disabled = true;
      if (submitCommentBtn) submitCommentBtn.disabled = true;

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
    // Reload posts to update edit/delete visibility and ensure correct display
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
    if (storiesFeed) storiesFeed.innerHTML = ''; // Clear current feed COMPLETELY
    if (snapshot.empty) {
      if (storiesFeed) storiesFeed.innerHTML = '<p class="loading-message">Walang post pa. Maging una!</p>';
      return;
    }

    // Re-render all posts from the snapshot
    snapshot.forEach((doc) => {
      const post = { id: doc.id, ...doc.data() };
      const postCard = createPostCardElement(post);
      storiesFeed.appendChild(postCard); // Append to maintain order based on query
    });
  }, (error) => {
    console.error("Error loading posts:", error);
    if (storiesFeed) storiesFeed.innerHTML = '<p class="message-area">Error loading stories.</p>';
  });
}

// Function to create a post card element
function createPostCardElement(post) {
  const postCard = document.createElement('div');
  postCard.classList.add('story-card'); // Changed to story-card to match styles.css
  postCard.dataset.postId = post.id;

  const postDate = post.timestamp ? new Date(post.timestamp.toDate()).toLocaleString() : 'Unknown Date';
  const isOwner = currentUserId && post.userId === currentUserId;
  const likedByCurrentUser = currentUserId && (post.likes || []).includes(currentUserId);

  // Ensure avatar and username have fallbacks if data is missing from the post document
  const displayAvatarUrl = post.userAvatarUrl || 'https://placehold.co/40?text=P'; // Use post's stored avatar URL
  const displayUserName = post.userName || 'Anonymous User'; // Use post's stored username

  postCard.innerHTML = `
    <div class="story-header">
      <div class="user-info">
        <img src="${displayAvatarUrl}" alt="Profile Pic" class="profile-pic">
        <span class="username" data-user-id="${post.userId}">${displayUserName}</span>
      </div>
      <div class="post-actions"> <!-- Renamed from post-actions-top to match styles.css -->
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
      <button class="comment-toggle-button" data-post-id="${post.id}" data-post-title="${post.userName}'s Post" data-post-desc="${post.content || ''}" data-post-img="${post.imageUrl || ''}">
        <i class="fas fa-comment"></i> Comments (${post.commentsCount || 0})
      </button>
      <button><i class="fas fa-share"></i> Share</button>
    </div>
    <div class="comments-section" id="comments-section-${post.id}">
      <div class="comments-list"></div>
      <div class="comment-input-area">
        <textarea placeholder="Isulat ang iyong komento..." class="comment-input" ${currentUserId ? '' : 'disabled'}></textarea>
        <button class="submit-comment-btn" ${currentUserId ? '' : 'disabled'}>Isumite</button>
      </div>
    </div>
  `;

  // Attach event listeners for the new post card
  attachPostCardEventListeners(postCard, post);
  return postCard;
}

// New function to attach event listeners to a post card
function attachPostCardEventListeners(postCard, post) {
  // Add event listener for the post author's name (username in story-card)
  const postAuthorSpan = postCard.querySelector('.username'); // Changed from .post-author
  if (postAuthorSpan) {
    postAuthorSpan.style.cursor = 'pointer'; // Make it look clickable
    postAuthorSpan.addEventListener('click', () => {
      const userIdToView = postAuthorSpan.dataset.userId;
      if (userIdToView) {
        window.location.href = `profile.html?userId=${userIdToView}`;
      }
    });
  }

  // Add event listener for like button
  const likeButton = postCard.querySelector('.like-button');
  if (likeButton) {
    likeButton.addEventListener('click', () => toggleLike(post.id, currentUserId));
  }

  // Add event listener for comment button to open modal
  const commentButton = postCard.querySelector('.comment-toggle-button'); // Changed to comment-toggle-button
  const commentsSection = postCard.querySelector(`.comments-section`); // Get the specific comments section for this post
  if (commentButton && commentsSection) {
    commentButton.addEventListener('click', () => {
      commentsSection.classList.toggle('active');
      if (commentsSection.classList.contains('active')) {
        commentButton.textContent = `Hide Comments (${post.commentsCount || 0})`;
        loadCommentsForPost(post.id, commentsSection.querySelector('.comments-list'));
      } else {
        commentButton.textContent = `Comments (${post.commentsCount || 0})`;
      }
    });
  }

  // Submit Comment Button (within each post's comment section)
  const submitCommentBtnPost = commentsSection.querySelector('.submit-comment-btn');
  const commentInputPost = commentsSection.querySelector('.comment-input');
  if (submitCommentBtnPost && commentInputPost) {
    submitCommentBtnPost.addEventListener('click', async () => {
      if (!currentUserId || !db) {
        showMessage(postMessageArea, "Mangyaring mag-log in at tiyakin na konektado ang database para mag-komento.", false);
        return;
      }
      const commentText = commentInputPost.value.trim();
      if (commentText) {
        await addComment(post.id, commentText);
        commentInputPost.value = ''; // Clear input after submission
      } else {
        showMessage(postMessageArea, "Walang laman ang komento.", false);
      }
    });
  }

  // Attach edit/delete listeners ONLY if the current user is the owner
  const editPostBtn = postCard.querySelector('.edit-post-btn');
  const deletePostBtn = postCard.querySelector('.delete-post-btn');

  if (editPostBtn) {
    editPostBtn.addEventListener('click', () => {
      toggleEditMode(postCard, post);
    });
  }

  if (deletePostBtn) {
    deletePostBtn.addEventListener('click', async () => {
      if (!db) {
        showMessage(postMessageArea, "Database error. Hindi makabura ng post.", false);
        return;
      }
      // Using a custom modal for confirmation instead of confirm()
      showConfirmModal("Sigurado ka bang gusto mong burahin ang post na ito?", async () => {
        await deletePost(post.id);
      });
    });
  }
}


// --- Like Functionality ---
async function toggleLike(postId, userId) {
  if (!db || !userId) {
    showMessage(postMessageArea, "Mangyaring mag-log in para mag-like.", false);
    return;
  }
  const postRef = doc(db, `artifacts/${appId}/public/data/posts`, postId);
  try {
    const postSnap = await getDoc(postRef);
    if (postSnap.exists()) {
      const postData = postSnap.data();
      let currentLikes = postData.likes || [];
      if (currentLikes.includes(userId)) {
        // User already liked, so unlike
        currentLikes = currentLikes.filter(id => id !== userId);
        await updateDoc(postRef, { likes: currentLikes });
        console.log("Unliked post:", postId);
      } else {
        // User hasn't liked, so like
        currentLikes.push(userId);
        await updateDoc(postRef, { likes: currentLikes });
        console.log("Liked post:", postId);
      }
    }
  } catch (error) {
    console.error("Error toggling like:", error);
    showMessage(postMessageArea, "Nabigo ang pag-like. Subukang muli.", false);
  }
}

// --- Comment Functionality (Modal and Inline) ---
// Note: currentOpenPostId and unsubscribeComments are already declared globally

function openModal(postId, title, description, imageUrl) {
  currentOpenPostId = postId;
  if (!overlay || !modalTitle || !modalDesc || !modalImg || !modalLikeBtn || !commentsDisplayArea || !commentInput || !submitCommentBtn || !modalCloseBtn) {
    console.error("Modal elements not found.");
    return;
  }

  modalTitle.textContent = title;
  modalDesc.textContent = description;
  modalImg.src = imageUrl || 'https://placehold.co/600x400?text=No+Image';
  modalImg.style.display = imageUrl ? 'block' : 'none'; // Show image only if URL exists

  // Update like count in modal
  const postRef = doc(db, `artifacts/${appId}/public/data/posts`, postId);
  onSnapshot(postRef, (docSnap) => {
    if (docSnap.exists()) {
      const postData = docSnap.data();
      const likeCountSpan = modalLikeBtn.querySelector('.like-count');
      if (likeCountSpan) {
        likeCountSpan.textContent = postData.likes ? postData.likes.length : 0;
      }
      // Highlight like button if current user has liked
      if (currentUserId && postData.likes && postData.likes.includes(currentUserId)) {
        modalLikeBtn.classList.add('liked');
      } else {
        modalLikeBtn.classList.remove('liked');
      }
    }
  });

  // Attach like functionality to modal like button
  modalLikeBtn.onclick = () => toggleLike(postId, currentUserId);

  // Load and display comments for this post
  loadCommentsForPost(postId, commentsDisplayArea); // Pass commentsDisplayArea here

  overlay.style.display = 'flex'; // Show the modal
}

function closeModal() {
  if (overlay) {
    overlay.style.display = 'none';
  }
  currentOpenPostId = null;
  if (unsubscribeComments) {
    unsubscribeComments(); // Unsubscribe from comments listener
    unsubscribeComments = null;
  }
  if (commentsDisplayArea) commentsDisplayArea.innerHTML = ''; // Clear comments
  if (commentInput) commentInput.value = ''; // Clear comment input
  if (commentMessageArea) commentMessageArea.style.display = 'none'; // Hide message area
}

// Event listener for modal close button
if (modalCloseBtn) {
  modalCloseBtn.addEventListener('click', closeModal);
}

// Event listener for overlay click (to close modal if clicking outside)
if (overlay) {
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });
}

async function addComment(postId, commentText) {
  if (!db || !currentUserId || !currentUserName) {
    showMessage(commentMessageArea, "Mangyaring mag-log in para magkomento.", false);
    return;
  }
  try {
    // Add comment document
    await addDoc(collection(db, `artifacts/${appId}/public/data/comments`), {
      postId: postId,
      userId: currentUserId,
      userName: currentUserName,
      userAvatarUrl: currentUserAvatarUrl, // Include avatar URL for comments
      comment: commentText,
      timestamp: new Date()
    });

    // Update commentsCount on the post document
    const postRef = doc(db, `artifacts/${appId}/public/data/posts`, postId);
    await updateDoc(postRef, {
      commentsCount: (await getDoc(postRef)).data().commentsCount + 1 || 1
    });

    showMessage(commentMessageArea, "Komento naidagdag na!", true);
    if (commentInput) commentInput.value = ''; // Clear input
  } catch (error) {
    console.error("Error adding comment:", error);
    showMessage(commentMessageArea, "Nabigo ang pagdagdag ng komento. Subukang muli.", false);
  }
}

function loadCommentsForPost(postId, commentsDisplayAreaElement) { // Renamed parameter for clarity
  if (!db) {
    console.error("Firestore database is not initialized. Cannot load comments.");
    if (commentsDisplayAreaElement) commentsDisplayAreaElement.innerHTML = '<p class="message-area">Database error. Hindi ma-load ang mga komento.</p>';
    return;
  }

  if (unsubscribeComments) {
    unsubscribeComments(); // Unsubscribe from previous listener
  }

  const commentsCollectionRef = collection(db, `artifacts/${appId}/public/data/comments`);
  const q = query(commentsCollectionRef, where('postId', '==', postId), orderBy('timestamp', 'asc'));

  unsubscribeComments = onSnapshot(q, (snapshot) => {
    if (commentsDisplayAreaElement) commentsDisplayAreaElement.innerHTML = ''; // Clear comments area
    if (snapshot.empty) {
      if (commentsDisplayAreaElement) commentsDisplayAreaElement.innerHTML = '<p style="text-align: center; color: #aaa;">Walang komento pa. Maging una!</p>';
      return;
    }

    snapshot.forEach((doc) => {
      const comment = doc.data();
      const commentElement = document.createElement('div');
      commentElement.classList.add('comment-item');
      const commentDate = comment.timestamp ? new Date(comment.timestamp.toDate()).toLocaleString() : 'Unknown Date';
      const displayCommentAvatarUrl = comment.userAvatarUrl || 'https://placehold.co/30?text=P'; // Fallback for comment avatar
      const displayCommentUserName = comment.userName || 'Anonymous User'; // Fallback for comment username

      commentElement.innerHTML = `
        <div class="comment-header">
          <img src="${displayCommentAvatarUrl}" alt="Avatar" class="profile-pic">
          <span class="comment-author" data-user-id="${comment.userId}">${displayCommentUserName}</span>
          <span class="comment-time">${commentDate}</span>
        </div>
        <p class="comment-text">${comment.comment}</p>
      `;
      if (commentsDisplayAreaElement) commentsDisplayAreaElement.appendChild(commentElement);

      // Add event listener for comment author's name
      const commentAuthorSpan = commentElement.querySelector('.comment-author');
      if (commentAuthorSpan) {
        commentAuthorSpan.style.cursor = 'pointer';
        commentAuthorSpan.addEventListener('click', () => {
          const userIdToView = commentAuthorSpan.dataset.userId;
          if (userIdToView) {
            window.location.href = `profile.html?userId=${userIdToView}`;
            closeModal(); // Close the modal when redirecting
          }
        });
      }
    });
  }, (error) => {
    console.error("Error loading comments:", error);
    if (commentsDisplayAreaElement) commentsDisplayAreaElement.innerHTML = '<p class="message-area">Error loading comments.</p>';
  });
}

// Event listener for comment submission
if (submitCommentBtn && commentInput && commentMessageArea) {
  submitCommentBtn.addEventListener('click', async () => {
    const commentText = commentInput.value.trim();
    if (commentText) {
      if (currentOpenPostId) {
        await addComment(currentOpenPostId, commentText);
      }
    } else {
      showMessage(commentMessageArea, "Walang laman ang komento.", false);
    }
  });
}

// --- Edit/Delete Post Functionality ---

function toggleEditMode(storyCard, post) {
  if (!db) {
    console.error("Firestore database is not initialized.");
    showMessage(postMessageArea, "Database error. Hindi makapag-edit ng post.", false);
    return;
  }
  const postTextElement = storyCard.querySelector('.post-text');
  const postActions = storyCard.querySelector('.post-actions'); // Get the post-actions div

  if (postTextElement.dataset.editing === 'true') {
    // This state should ideally not be reached if the buttons are correctly toggled
    console.warn("Already in edit mode. Exiting.");
    return;
  } else {
    // Enter edit mode
    const currentContent = postTextElement.textContent;
    const textarea = document.createElement('textarea');
    textarea.classList.add('post-text'); // Keep the class for styling
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

    // Change action buttons
    postActions.innerHTML = `
      <button class="save-post-btn" data-post-id="${post.id}">Save</button>
      <button class="cancel-edit-btn" data-post-id="${post.id}">Cancel</button>
    `;

    // Attach listeners for new buttons
    storyCard.querySelector('.save-post-btn').addEventListener('click', () => {
      const updatedContent = textarea.value.trim();
      updatePost(post.id, { content: updatedContent });
      // Revert back to p tag and original buttons after save
      textarea.outerHTML = `<p class="post-text">${updatedContent}</p>`;
      postActions.innerHTML = `
        <button class="edit-post-btn" data-post-id="${post.id}">Edit</button>
        <button class="delete-post-btn" data-post-id="${post.id}">Delete</button>
      `;
      attachPostCardEventListeners(storyCard, post); // Re-attach all listeners for the card
    });

    storyCard.querySelector('.cancel-edit-btn').addEventListener('click', () => {
      // Revert to original content and buttons
      textarea.outerHTML = `<p class="post-text">${currentContent}</p>`;
      postActions.innerHTML = `
        <button class="edit-post-btn" data-post-id="${post.id}">Edit</button>
        <button class="delete-post-btn" data-post-id="${post.id}">Delete</button>
      `;
      attachPostCardEventListeners(storyCard, post); // Re-attach all listeners for the card
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
    const q = query(commentsRef, where('postId', '==', postId)); // Query comments for this specific post

    const commentsToDelete = [];
    const snapshot = await getDocs(q); // Use getDocs to fetch once
    snapshot.forEach(doc => {
      commentsToDelete.push(deleteDoc(doc.ref));
    });
    await Promise.all(commentsToDelete);

    showMessage(postMessageArea, "Post at mga komento nabura na!", true);
  } catch (error) {
    console.error("Error deleting post and comments:", error);
    showMessage(postMessageArea, "Nabigo ang pagbura ng post.", false);
  }
}

// --- Custom Confirmation Modal (instead of alert/confirm) ---
function showConfirmModal(message, onConfirm) {
  // Create modal elements dynamically or use existing hidden ones
  let confirmModal = document.getElementById('customConfirmModal');
  if (!confirmModal) {
    confirmModal = document.createElement('div');
    confirmModal.id = 'customConfirmModal';
    confirmModal.classList.add('overlay'); // Reuse overlay styling
    confirmModal.innerHTML = `
      <div class="modal-content" style="max-width: 400px; padding: 20px; text-align: center;">
        <p id="confirmMessage" style="font-size: 1.1em; margin-bottom: 20px; color: #333;"></p>
        <div style="display: flex; justify-content: center; gap: 15px;">
          <button id="confirmYesBtn" style="background-color: #dc3545; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Oo</button>
          <button id="confirmNoBtn" style="background-color: #6c757d; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Hindi</button>
        </div>
      </div>
    `;
    document.body.appendChild(confirmModal);
  }

  document.getElementById('confirmMessage').textContent = message;
  confirmModal.style.display = 'flex';

  const confirmYesBtn = document.getElementById('confirmYesBtn');
  const confirmNoBtn = document.getElementById('confirmNoBtn');

  // Clear previous listeners to prevent multiple calls
  confirmYesBtn.onclick = null;
  confirmNoBtn.onclick = null;

  confirmYesBtn.onclick = () => {
    onConfirm();
    confirmModal.style.display = 'none';
  };

  confirmNoBtn.onclick = () => {
    confirmModal.style.display = 'none';
  };
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

// For dropdown logout button (if it exists)
const logoutBtnDropdown = document.getElementById('logoutBtnDropdown');
if (logoutBtnDropdown && auth) {
  logoutBtnDropdown.addEventListener("click", async () => {
    try {
      await auth.signOut();
      console.log("User signed out successfully from dropdown.");
      window.location.href = "login.html";
    } catch (error) {
      console.error("Error signing out from dropdown:", error);
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
