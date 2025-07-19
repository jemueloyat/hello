// profile.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc, getDocs // Added setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// TINANGGAL: Firebase Storage imports dahil direktang Base64 na sa Firestore.
// import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// UI Elements para sa Profile at Paglikha ng Post
const profileUsername = document.getElementById('profileUsername');
const profileEmail = document.getElementById('profileEmail');
const profileBio = document.getElementById('profileBio');
const editProfileBtn = document.getElementById('editProfileBtn');
const profileAvatar = document.getElementById('profileAvatar');
const avatarUpload = document.getElementById('avatarUpload');
const changeAvatarBtn = document.getElementById('changeAvatarBtn'); // Button para sa pagpapalit ng avatar
const profilePostsFeed = document.getElementById('profilePostsFeed'); // Para sa pagpapakita ng sariling posts ng user

// Mga Elemento para sa Paglikha ng Post
const postContentInput = document.getElementById('postContentInput');
const postImageInput = document.getElementById('postImageInput');
const createPostBtn = document.getElementById('createPostBtn');
const postMessageArea = document.getElementById('postMessageArea');
const logoutBtn = document.getElementById('logoutBtn');

// Mga seksyon na kailangang i-hide/disable kung hindi sariling profile
const postCreationSection = document.querySelector('.post-creation-section');
const profileActionsDiv = document.querySelector('.profile-actions');


// Tukuyin ang appId mula sa __app_id, na ibinigay ng Canvas environment.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
console.log("App ID in use:", appId);

// Gamitin ang Canvas-provided Firebase config nang direkta, siguraduhin na ang projectId at apiKey ay laging nakatakda.
let firebaseConfig = {};
const providedApiKey = "AIzaSyDoijFlD_hJ2mp4FstfSZO4qUPKIzEdmPs"; // API Key na ibinigay ng User
const providedProjectId = "hello-e7a6d"; // Project ID na ibinigay ng User

// Inalis ang __firebase_config parsing logic upang direktang gamitin ang hardcoded values.
// Ito ay tumutugon sa kahilingan na huwag gumamit ng JSON para sa config at inaalis ang kaugnay na warning.
firebaseConfig = {
  apiKey: providedApiKey,
  authDomain: `${providedProjectId}.firebaseapp.com`,
  projectId: providedProjectId,
  storageBucket: `${providedProjectId}.appspot.com`, // Kailangan pa rin para sa Firebase init, ngunit hindi para sa direktang pag-imbak ng larawan
  messagingSenderId: "dummy-messaging-sender-id",
  appId: "dummy-app-id"
};
console.log("Firebase Config in use: Using hardcoded values.");


// Suriin kung ang mahahalagang Firebase config ay nawawala pa rin
if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
    console.error("Firebase initialization warning: Essential firebaseConfig (projectId/apiKey) might be missing even after fallback. Firebase-dependent features will be disabled.");
    if (postMessageArea) showMessage(postMessageArea, "Error: Hindi makakonekta sa database. Pakisuri ang configuration.", false);
}

const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
console.log("Initial Auth Token status:", initialAuthToken ? "present" : "not present");

let app;
let db;
let auth;
// TINANGGAL: storage variable dahil hindi na ginagamit ang Firebase Storage para sa mga larawan.
// let storage;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    // TINANGGAL: storage initialization
    // storage = getStorage(app);
} catch (error) {
    console.error("Failed to initialize Firebase:", error);
    if (postMessageArea) showMessage(postMessageArea, "Error: Hindi makakonekta sa database. Pakisuri ang configuration.", false);
    db = null;
    auth = null;
    // TINANGGAL: storage = null;
}


let currentUserId = null; // ID ng kasalukuyang naka-authenticate na user
let currentUserName = null; // Pangalan ng kasalukuyang naka-authenticate na user
let currentUserEmail = null;
let currentUserBio = null;
let currentUserAvatarUrl = null;

let targetProfileUserId = null; // ID ng user na kasalukuyang tinitingnan ang profile

let unsubscribeUserPosts = null; // Upang pamahalaan ang real-time listener para sa sariling posts ng user

// --- Mga Katulong na Function ---

function showMessage(element, message, isSuccess = false) {
  if (!element) return;
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

if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUserId = user.uid;
      // Initialize currentUserName with Firebase display name or email, or 'Anonymous'
      currentUserName = user.displayName || user.email || 'Anonymous';
      currentUserEmail = user.email || '';
      console.log(`User logged in: ${currentUserName} (${currentUserId})`);

      // I-load ang profile ng kasalukuyang user para sa sariling impormasyon (username, avatar)
      const userRef = doc(db, `users`, currentUserId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        // Prioritize stored username, then Firebase auth display name/email
        currentUserName = userData.username || user.displayName || user.email || 'Anonymous';
        currentUserAvatarUrl = userData.avatarUrl || null;
      } else {
        // If user document doesn't exist, create it with initial data
        const initialUsername = user.displayName || user.email || 'Anonymous';
        await setDoc(userRef, {
          username: initialUsername,
          email: user.email || '',
          bio: "Hello, I'm new to Philippine Gaze!",
          createdAt: new Date(),
          avatarUrl: null // No avatar initially
        }, { merge: true }); // Use merge:true to avoid overwriting if partial data exists
        currentUserName = initialUsername;
        currentUserAvatarUrl = null;
      }

      // Tukuyin kung aling profile ang titingnan
      const urlParams = new URLSearchParams(window.location.search);
      targetProfileUserId = urlParams.get('userId') || currentUserId;

      if (db) { // ADDED: Check if db is initialized before loading data
        await loadProfileData(targetProfileUserId); // I-load ang data ng target na profile
        loadUserPosts(targetProfileUserId); // I-load ang posts ng target na profile
      } else {
        console.error("Firestore DB not available, cannot load profile or posts.");
        if (profileUsername) profileUsername.textContent = 'Service Unavailable';
        if (profileEmail) profileEmail.textContent = 'Please try again later.';
        if (profileBio) profileBio.textContent = 'Database connection failed.';
        if (profileAvatar) profileAvatar.src = 'https://placehold.co/120?text=Error';
        if (profilePostsFeed) profilePostsFeed.innerHTML = '<p class="message-area">Hindi ma-load ang mga post. Database error.</p>';
      }

      // I-adjust ang UI batay kung sariling profile o hindi
      if (targetProfileUserId === currentUserId) {
        // Sariling profile: paganahin ang pag-edit at paglikha ng post
        if (postCreationSection) postCreationSection.style.display = 'block';
        if (profileActionsDiv) profileActionsDiv.style.display = 'block';
        if (editProfileBtn) editProfileBtn.style.display = 'inline-block'; // Ensure button is visible
        if (changeAvatarBtn) changeAvatarBtn.style.display = 'inline-block'; // Ensure button is visible
        if (postContentInput) postContentInput.disabled = false;
        if (postImageInput) postImageInput.disabled = false;
        if (createPostBtn) createPostBtn.disabled = false;
        if (avatarUpload) avatarUpload.disabled = false; // Enable avatar file input
      } else {
        // Profile ng ibang user: i-hide/disable ang pag-edit at paglikha ng post
        if (postCreationSection) postCreationSection.style.display = 'none';
        if (profileActionsDiv) profileActionsDiv.style.display = 'none';
        if (editProfileBtn) editProfileBtn.style.display = 'none'; // Hide button
        if (changeAvatarBtn) changeAvatarBtn.style.display = 'none'; // Hide button
        if (avatarUpload) avatarUpload.disabled = true; // Disable avatar file input
      }

    } else {
      currentUserId = null;
      currentUserName = null;
      currentUserEmail = null;
      currentUserBio = null;
      currentUserAvatarUrl = null;
      console.log('User logged out or not authenticated.');

      // Tukuyin kung aling profile ang titingnan (kung may userId sa URL)
      const urlParams = new URLSearchParams(window.location.search);
      targetProfileUserId = urlParams.get('userId');

      if (targetProfileUserId) {
        // Kung may userId sa URL, i-load ang profile ng user na iyon (read-only)
        if (db) { // ADDED: Check if db is initialized before loading data
          await loadProfileData(targetProfileUserId);
          loadUserPosts(targetProfileUserId);
        } else {
          console.error("Firestore DB not available, cannot load profile or posts for target user.");
          if (profileUsername) profileUsername.textContent = 'Service Unavailable';
          if (profileEmail) profileEmail.textContent = 'Please try again later.';
          if (profileBio) profileBio.textContent = 'Database connection failed.';
          if (profileAvatar) profileAvatar.src = 'https://placehold.co/120?text=Error';
          if (profilePostsFeed) profilePostsFeed.innerHTML = '<p class="message-area">Hindi ma-load ang mga post. Database error.</p>';
        }

        if (postCreationSection) postCreationSection.style.display = 'none';
        if (profileActionsDiv) profileActionsDiv.style.display = 'none';
        if (editProfileBtn) editProfileBtn.style.display = 'none'; // Hide button
        if (changeAvatarBtn) changeAvatarBtn.style.display = 'none'; // Hide button
        if (avatarUpload) avatarUpload.disabled = true; // Disable avatar file input
      } else {
        // Walang naka-login at walang userId sa URL, ipakita ang guest view
        if (profileUsername) profileUsername.textContent = '[Guest User]';
        if (profileEmail) profileEmail.textContent = '';
        if (profileBio) profileBio.textContent = 'Please log in to see your profile.';
        if (profileAvatar) profileAvatar.src = 'https://placehold.co/120?text=P';
        if (profilePostsFeed) profilePostsFeed.innerHTML = '<p class="loading-message">Mangyaring mag-log in para makita ang iyong mga post.</p>';
        if (postCreationSection) postCreationSection.style.display = 'none';
        if (profileActionsDiv) profileActionsDiv.style.display = 'none';
        if (editProfileBtn) editProfileBtn.style.display = 'none'; // Hide button
        if (changeAvatarBtn) changeAvatarBtn.style.display = 'none'; // Hide button
        if (avatarUpload) avatarUpload.disabled = true; // Disable avatar file input
      }

      // I-disable ang mga input para sa paglikha ng post
      if (postContentInput) postContentInput.disabled = true;
      if (postImageInput) postImageInput.disabled = true;
      if (createPostBtn) createPostBtn.disabled = true;

      if (unsubscribeUserPosts) {
        unsubscribeUserPosts();
        unsubscribeUserPosts = null;
      }

      // Subukan ang anonymous sign-in kung walang custom token
      if (!initialAuthToken && auth) {
        try {
          await signInAnonymously(auth);
          console.log("Successfully signed in anonymously.");
        } catch (error) {
          console.error("Error signing in anonymously:", error);
        }
      }
    }
  });
}

// Paunang pagtatangka ng sign-in gamit ang custom token
document.addEventListener('DOMContentLoaded', async () => {
  if (initialAuthToken && auth) {
    try {
      await signInWithCustomToken(auth, initialAuthToken);
      console.log("Successfully signed in with custom token.");
    } catch (error) {
      console.error("Error signing in with custom token:", error);
      console.log("Falling back to anonymous sign-in after custom token failure.");
      if (auth) {
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


// --- Profile Management Functions ---
async function loadProfileData(userIdToLoad) {
  if (!db || !userIdToLoad) return;
  const userRef = doc(db, `users`, userIdToLoad);
  try {
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      // Ensure username is displayed correctly, falling back to email or 'Anonymous User'
      if (profileUsername) profileUsername.textContent = userData.username || userData.email || 'Anonymous User';
      
      // HIDE THE EMAIL ELEMENT
      if (profileEmail) {
        profileEmail.textContent = ''; // Clear content
        profileEmail.style.display = 'none'; // Hide the element
      }

      if (profileBio) profileBio.textContent = userData.bio || 'Walang bio pa.';
      if (userData.avatarUrl && profileAvatar) {
        profileAvatar.src = userData.avatarUrl;
      } else {
        profileAvatar.src = 'https://placehold.co/120?text=P';
      }
    } else {
      // Kung hindi mahanap ang user, ipakita ang default
      if (profileUsername) profileUsername.textContent = 'User Not Found';
      
      // HIDE THE EMAIL ELEMENT
      if (profileEmail) {
        profileEmail.textContent = ''; // Clear content
        profileEmail.style.display = 'none'; // Hide the element
      }

      if (profileBio) profileBio.textContent = 'Ang profile na ito ay hindi umiiral o nabura.';
      if (profileAvatar) profileAvatar.src = 'https://placehold.co/120?text=P';
    }
  } catch (error) {
    console.error("Error loading user profile data:", error);
    // Mas specific na mensahe sa console para sa debugging
    console.error("Firestore error details:", error.code, error.message);
    if (profileUsername) profileUsername.textContent = 'Error Loading Profile';
    
    // HIDE THE EMAIL ELEMENT ON ERROR
    if (profileEmail) {
      profileEmail.textContent = ''; // Clear content
      profileEmail.style.display = 'none'; // Hide the element
    }

    if (profileBio) profileBio.textContent = 'May problema sa pag-load ng profile. Pakisuri ang console para sa detalye.';
    if (profileAvatar) profileAvatar.src = 'https://placehold.co/120?text=Error'; // Error placeholder
  }
}


// Edit Profile Button (basic functionality sa ngayon)
if (editProfileBtn) {
  editProfileBtn.addEventListener('click', async () => {
    if (!currentUserId || !db || targetProfileUserId !== currentUserId) {
      showMessage(postMessageArea, "Hindi mo maaaring i-edit ang profile na ito.", false);
      return;
    }
    const newUsername = prompt("Enter new username:", profileUsername.textContent);
    const newBio = prompt("Enter new bio:", profileBio.textContent);

    if (newUsername !== null || newBio !== null) {
      const userRef = doc(db, `users`, currentUserId);
      const updates = {};
      if (newUsername !== null && newUsername.trim() !== '') {
        updates.username = newUsername.trim();
      }
      if (newBio !== null) { // Payagan ang walang laman na bio
        updates.bio = newBio.trim();
      }

      if (Object.keys(updates).length > 0) {
        try {
          await updateDoc(userRef, updates);
          showMessage(postMessageArea, "Profile updated successfully!", true);
          // I-reload ang profile data para ma-reflect ang pagbabago
          await loadProfileData(currentUserId);
          // I-update ang global currentUserName kung nagbago
          if (updates.username) currentUserName = updates.username;
        } catch (error) {
          console.error("Error updating profile:", error);
          showMessage(postMessageArea, "Nabigo ang pag-update ng profile.", false);
        }
      }
    }
  });
}

// Event listener para sa "Change Profile Picture" button
if (changeAvatarBtn && avatarUpload) {
    changeAvatarBtn.addEventListener('click', () => {
        if (!currentUserId || targetProfileUserId !== currentUserId) {
            showMessage(postMessageArea, "Hindi mo maaaring palitan ang profile picture na ito.", false);
            return;
        }
        avatarUpload.click(); // I-trigger ang hidden file input
    });
}


// Avatar Upload (umiiral na logic, ngayon ay maaaring i-trigger ng changeAvatarBtn)
// Ngayon ay direktang nag-iimbak ng Base64 sa Firestore, nilalampasan ang Firebase Storage.
if (avatarUpload && profileAvatar && db) {
  avatarUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!currentUserId || targetProfileUserId !== currentUserId) {
        showMessage(postMessageArea, "Hindi mo maaaring i-upload ang avatar para sa profile na ito.", false);
        return;
    }
    showMessage(postMessageArea, "Uploading avatar...", false);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Image = e.target.result;
      console.log("Generated Base64 for avatar:", base64Image.substring(0, 50) + "...");

      const userRef = doc(db, `users`, currentUserId);
      try {
        await updateDoc(userRef, { avatarUrl: base64Image });
        profileAvatar.src = base64Image;
        currentUserAvatarUrl = base64Image; // Update global variable
        showMessage(postMessageArea, "Avatar uploaded successfully!", true);
      } catch (error) {
        console.error("Error uploading avatar:", error);
        showMessage(postMessageArea, "Failed to upload avatar.", false);
      }
    };
    reader.onerror = (error) => {
        console.error("Error reading file:", error);
        showMessage(postMessageArea, "Nabigo ang pagbasa ng imahe.", false);
    };
    reader.readAsDataURL(file);
  });
} else if (avatarUpload || profileAvatar || !db) {
    console.warn("Avatar upload elements or Firestore not fully available. Avatar upload disabled.");
    if (changeAvatarBtn) changeAvatarBtn.disabled = true;
}


// --- Functionality sa Paglikha ng Post ---
// Ngayon ay direktang nag-iimbak ng Base64 sa Firestore, nilalampasan ang Firebase Storage.
if (createPostBtn) {
  createPostBtn.addEventListener('click', async () => {
    if (!currentUserId || !currentUserName || !db || targetProfileUserId !== currentUserId) {
      showMessage(postMessageArea, "Hindi ka maaaring mag-post sa profile na ito.", false);
      return;
    }

    const postContent = postContentInput.value.trim();
    const imageFile = postImageInput.files[0];

    if (!postContent && !imageFile) {
      showMessage(postMessageArea, "Mangyaring magsulat ng post o mag-upload ng imahe.", false);
      return;
    }

    showMessage(postMessageArea, "Nagpoproseso ng post...", false);
    createPostBtn.disabled = true;

    let imageUrl = null;
    try {
      if (imageFile) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          imageUrl = e.target.result;

          await addDoc(collection(db, `artifacts/${appId}/public/data/posts`), {
            userId: currentUserId,
            userName: currentUserName, // Use the most updated currentUserName
            userAvatarUrl: currentUserAvatarUrl, // Use the most updated currentUserAvatarUrl
            content: postContent,
            imageUrl: imageUrl,
            timestamp: new Date(),
            likes: [],
            commentsCount: 0
          });

          showMessage(postMessageArea, "Post naidagdag na sa Stories!", true);
          postContentInput.value = '';
          postImageInput.value = '';
          createPostBtn.disabled = false;
        };
        reader.onerror = (error) => {
            console.error("Error reading file:", error);
            showMessage(postMessageArea, "Nabigo ang pagbasa ng imahe.", false);
            createPostBtn.disabled = false;
        };
        reader.readAsDataURL(imageFile);
      } else {
        await addDoc(collection(db, `artifacts/${appId}/public/data/posts`), {
          userId: currentUserId,
          userName: currentUserName, // Use the most updated currentUserName
          userAvatarUrl: currentUserAvatarUrl, // Use the most updated currentUserAvatarUrl
          content: postContent,
          imageUrl: null,
          timestamp: new Date(),
          likes: [],
          commentsCount: 0
        });
        showMessage(postMessageArea, "Post naidagdag na sa Stories!", true);
        postContentInput.value = '';
        createPostBtn.disabled = false;
      }
    } catch (error) {
      console.error("Error creating post:", error);
      showMessage(postMessageArea, "Nabigo ang pag-post. Subukang muli.", false);
      createPostBtn.disabled = false;
    }
  });
} else {
  console.warn("Post creation elements or Firestore not fully available. Post creation disabled.");
  if (postContentInput) postContentInput.disabled = true;
  if (postImageInput) postImageInput.disabled = true;
  if (createPostBtn) createPostBtn.disabled = true;
}

// --- Pagpapakita ng Posts ng User (target user) ---
function loadUserPosts(userIdToLoad) {
  if (!db || !userIdToLoad) {
    console.error("Firestore database or target user not initialized. Cannot load user posts.");
    if (profilePostsFeed) profilePostsFeed.innerHTML = '<p class="message-area">Database error. Hindi ma-load ang mga post.</p>';
    return;
  }

  if (unsubscribeUserPosts) {
    unsubscribeUserPosts();
  }

  const postsCollectionRef = collection(db, `artifacts/${appId}/public/data/posts`);
  const q = query(postsCollectionRef, where('userId', '==', userIdToLoad), orderBy('timestamp', 'desc'));

  unsubscribeUserPosts = onSnapshot(q, (snapshot) => {
    if (profilePostsFeed) profilePostsFeed.innerHTML = '';
    if (snapshot.empty) {
      if (profilePostsFeed) profilePostsFeed.innerHTML = '<p class="loading-message">Walang post pa ang user na ito.</p>';
      return;
    }

    snapshot.forEach((doc) => {
      const post = { id: doc.id, ...doc.data() };
      console.log("Rendering post with image (Base64):", post.imageUrl ? post.imageUrl.substring(0, 50) + "..." : "No image");
      renderUserPost(post);
    });
  }, (error) => {
    console.error("Error loading user posts:", error);
    if (profilePostsFeed) profilePostsFeed.innerHTML = '<p class="message-area">Error loading user posts.</p>';
  });
}

function renderUserPost(post) {
    const postCard = document.createElement('div');
    postCard.classList.add('post-card');
    postCard.dataset.postId = post.id;

    const postDate = post.timestamp ? new Date(post.timestamp.toDate()).toLocaleString() : 'Unknown Date';
    // Check if the post belongs to the currently logged-in user
    const isOwner = currentUserId && post.userId === currentUserId;

    postCard.innerHTML = `
        <div class="post-header">
            <img src="${post.userAvatarUrl || 'https://placehold.co/40?text=P'}" alt="Profile Pic" class="profile-pic">
            <span class="post-author">${post.userName || 'Anonymous User'}</span> <!-- Ensure userName is displayed -->
            <span class="post-time">${postDate}</span>
            <div class="post-actions">
                ${isOwner ? `<button class="edit-post-btn" data-post-id="${post.id}">Edit</button>` : ''}
                ${isOwner ? `<button class="delete-post-btn" data-post-id="${post.id}">Delete</button>` : ''}
            </div>
        </div>
        <div class="post-content">
            <p class="post-text" data-original-content="${post.content || ''}">${post.content || ''}</p>
            ${post.imageUrl ? `<img src="${post.imageUrl}" alt="Post Image" class="post-image">` : ''}
        </div>
        <div class="post-actions-bottom">
            <button class="like-button" data-post-id="${post.id}">
                <i class="fas fa-heart"></i> <span class="like-count">${post.likes ? post.likes.length : 0}</span>
            </button>
            <button><i class="fas fa-comment"></i> Comments (${post.commentsCount || 0})</button>
            <button><i class="fas fa-share"></i> Share</button>
        </div>
    `;

    if (profilePostsFeed) profilePostsFeed.appendChild(postCard);

    // Attach event listeners for edit and delete buttons ONLY if it's the owner's post
    if (isOwner) {
        attachUserPostEventListeners(postCard, post);
    }
}

function attachUserPostEventListeners(postCard, post) {
    const editPostBtn = postCard.querySelector('.edit-post-btn');
    if (editPostBtn) {
        editPostBtn.addEventListener('click', () => {
            toggleEditModeUserPost(postCard, post);
        });
    }

    const deletePostBtn = postCard.querySelector('.delete-post-btn');
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

function toggleEditModeUserPost(postCard, post) {
    if (!db) {
        console.error("Firestore database is not initialized.");
        showMessage(postMessageArea, "Database error. Hindi makapag-edit ng post.", false);
        return;
    }
    const postTextElement = postCard.querySelector('.post-text');
    const postActions = postCard.querySelector('.post-actions');

    if (postTextElement.dataset.editing === 'true') {
        const newContent = postTextElement.value.trim();
        updatePost(post.id, { content: newContent });
        postTextElement.outerHTML = `<p class="post-text" data-original-content="${newContent}">${newContent}</p>`;
        postActions.innerHTML = `
            <button class="edit-post-btn" data-post-id="${post.id}">Edit</button>
            <button class="delete-post-btn" data-post-id="${post.id}">Delete</button>
        `;
        attachUserPostEventListeners(postCard, post);
    } else {
        const currentContent = postTextElement.dataset.originalContent || postTextElement.textContent;
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
        textarea.dataset.editing = 'true';

        postTextElement.replaceWith(textarea);

        postActions.innerHTML = `
            <button class="save-post-btn" data-post-id="${post.id}">Save</button>
            <button class="cancel-edit-btn" data-post-id="${post.id}">Cancel</button>
        `;

        postCard.querySelector('.save-post-btn').addEventListener('click', () => {
            const updatedContent = textarea.value.trim();
            updatePost(post.id, { content: updatedContent });
            textarea.outerHTML = `<p class="post-text" data-original-content="${updatedContent}">${updatedContent}</p>`;
            postActions.innerHTML = `
                <button class="edit-post-btn" data-post-id="${post.id}">Edit</button>
                <button class="delete-post-btn" data-post-id="${post.id}">Delete</button>
            `;
            attachUserPostEventListeners(postCard, post);
        });

        postCard.querySelector('.cancel-edit-btn').addEventListener('click', () => {
            textarea.outerHTML = `<p class="post-text" data-original-content="${currentContent}">${currentContent}</p>`;
            postActions.innerHTML = `
                <button class="edit-post-btn" data-post-id="${post.id}">Edit</button>
                <button class="delete-post-btn" data-post-id="${post.id}">Delete</button>
            `;
            attachUserPostEventListeners(postCard, post);
        });
        textarea.focus();
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
    // Delete post document
    await deleteDoc(doc(db, `artifacts/${appId}/public/data/posts`, postId));

    // Delete associated comments
    const commentsRef = collection(db, `artifacts/${appId}/public/data/comments`);
    const q = query(commentsRef, where('postId', '==', postId));
    const commentsSnapshot = await getDocs(q);
    const deletePromises = [];
    commentsSnapshot.forEach(commentDoc => {
      deletePromises.push(deleteDoc(commentDoc.ref));
    });
    await Promise.all(deletePromises);

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
if (logoutBtn && auth) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await auth.signOut();
      console.log("User signed out successfully.");
      window.location.href = "login.html";
    } catch (error) {
      console.error("Error signing out:", error);
      showMessage(postMessageArea, "Nabigo ang pag-logout. Subukang muli.", false);
    }
  });
}

// Initial load of user profile and posts when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // Authentication listener will handle initial loading of profile and posts
});
