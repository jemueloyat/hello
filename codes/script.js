// luzon.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, updateDoc, arrayUnion, arrayRemove, getDoc, setDoc, collection, addDoc, query, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"; // Ensure signOut is imported

// Prioritize Canvas-provided Firebase config, fallback to hardcoded if problematic
let firebaseConfig;
try {
  const canvasConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
  if (canvasConfig && canvasConfig.projectId) {
    firebaseConfig = canvasConfig;
    console.log("Firebase Config: Using Canvas-provided config.");
  } else {
    throw new Error("Canvas config missing projectId or malformed, falling back.");
  }
} catch (e) {
  console.warn("Firebase Config: Failed to parse __firebase_config or it's invalid, using hardcoded config:", e);
  firebaseConfig = {
    apiKey: "AIzaSyDoijFlD_hJ2mp4FstfSZO4qUPKIzEdmPs", // Ito ang API Key na ibinigay mo
    authDomain: "hello-e7a6d.firebaseapp.com",
    projectId: "hello-e7a6d",
    storageBucket: "hello-e7a6d.appspot.com",
    messagingSenderId: "693146874206",
    appId: "1:693146874206:web:d37f7a3c823fcba4401fcf"
  };
}
console.log("Firebase Config in use:", firebaseConfig); // Log the final config

// The initialAuthToken is still used if provided by the Canvas environment
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
console.log("Initial Auth Token status:", initialAuthToken ? "present" : "not present"); // Log token status

// Define appId, prioritizing __app_id, then firebaseConfig.appId, then a default
const appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.appId || 'default-app-id';
console.log("App ID in use:", appId); // Log the final appId

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
console.log("Firebase app, db, auth initialized successfully."); // Confirm initialization


let currentSpotId = null; // Para masubaybayan ang kasalukuyang bukas na spot sa modal
let unsubscribeComments = null; // Para i-unsubscribe ang real-time listener
let currentUserId = null; // Para itago ang kasalukuyang user ID

// Function para i-update ang estado ng favorite button (text at class)
function updateFavoriteButtonState(button, isFavorited) {
  if (isFavorited) {
    button.classList.add('favorited');
    button.textContent = '♥ Favorited'; // Ibinabalik sa text na may puso
  } else {
    button.classList.remove('favorited');
    button.textContent = '♡ Add to Favorites'; // Ibinabalik sa text na may puso
  }
}

// Helper function to display temporary messages in the modal
function showTemporaryMessage(message, isError = false) {
  const messageArea = document.getElementById('comment-message-area');
  if (messageArea) {
    messageArea.textContent = message;
    messageArea.style.color = isError ? '#ff5252' : '#ffb300'; // Red for error, orange for info
    messageArea.style.display = 'block';
    setTimeout(() => {
      messageArea.textContent = '';
      messageArea.style.display = 'none';
    }, 3000); // Message disappears after 3 seconds
  }
}

// Function para mag-submit ng reply
async function submitReply(parentId, replyText, replyInputContainer) {
  const user = auth.currentUser;

  if (!user) {
    showTemporaryMessage("Mangyaring mag-log in para mag-komento.", true);
    return;
  }

  if (!replyText) {
    showTemporaryMessage("Walang laman ang komento. Mangyaring maglagay ng komento.", true);
    return;
  }

  if (!currentSpotId) {
    showTemporaryMessage("Walang spot na napili para sa komento.", true);
    return;
  }

  try {
    await addDoc(collection(db, `artifacts/${appId}/public/data/comments`), {
      spotId: currentSpotId,
      userId: user.uid,
      userName: user.displayName || user.email || 'Anonymous',
      commentText: replyText,
      timestamp: new Date(),
      parentId: parentId // Idagdag ang parentId para sa replies
    });
    showTemporaryMessage("Komento naidagdag na!", false);
    replyInputContainer.remove(); // Tanggalin ang reply input field pagkatapos mag-submit
    loadComments(currentSpotId); // I-reload ang comments para makita ang bagong reply
  } catch (error) {
    console.error("Error sa pagdagdag ng komento:", error);
    showTemporaryMessage("Nabigo ang pagdagdag ng komento. Subukang muli. Tingnan ang console para sa detalye.", true);
  }
}

// Function para magpakita ng reply input field
function showReplyInput(commentElement, parentId) {
  // Tanggalin ang anumang existing reply input para sa comment na ito
  const existingReplyInput = commentElement.querySelector('.reply-input-area');
  if (existingReplyInput) {
    existingReplyInput.remove();
  }

  const replyInputArea = document.createElement('div');
  replyInputArea.classList.add('comment-input-area', 'reply-input-area');
  
  replyInputArea.classList.add('comment-input-area', 'reply-input-area'); // Add reply-input-area class for specific styling

  // Indent the reply input based on its parent's status
  if (parentId) { // If replying to an existing comment (which might already be indented)
      replyInputArea.style.marginLeft = '0px'; // No extra margin, it's already inside an indented commentItem
  } else { // If replying to a top-level comment
      replyInputArea.style.marginLeft = '20px'; // Indent the input for first-level replies
  }
  replyInputArea.style.borderLeft = '2px solid #ffb300'; // Tali for reply input
  replyInputArea.style.paddingLeft = '15px'; // Padding for tali

  const textarea = document.createElement('textarea');
  textarea.placeholder = "Isulat ang iyong reply...";
  textarea.disabled = !auth.currentUser; // Disable if not logged in

  const submitButton = document.createElement('button');
  submitButton.textContent = "Reply";
  submitButton.disabled = !auth.currentUser; // Disable if not logged in

  submitButton.addEventListener('click', () => {
    submitReply(parentId, textarea.value.trim(), replyInputArea);
  });

  replyInputArea.appendChild(textarea);
  replyInputArea.appendChild(submitButton);
  commentElement.appendChild(replyInputArea); // Append to the commentItem itself

  textarea.focus(); // Focus on the new textarea
}

// Function para mag-render ng isang comment (kasama ang replies)
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
  commentItem.innerHTML = `
    <strong>${comment.userName || 'Anonymous'}</strong> <span style="font-size: 0.8em; color: #888;">(${commentDate})</span>
    <p>${comment.commentText}</p>
    <button class="reply-button" data-comment-id="${comment.id}">Reply</button>
  `;
  parentElement.appendChild(commentItem);

  const replyButton = commentItem.querySelector('.reply-button');
  if (replyButton) {
    replyButton.addEventListener('click', () => {
      // Check if a reply input already exists for this comment and remove it
      const existingReplyInput = commentItem.querySelector('.reply-input-area');
      if (existingReplyInput) {
        existingReplyInput.remove();
      } else {
        showReplyInput(commentItem, comment.id);
      }
    });
  }

  // Handle replies
  if (comment.replies && comment.replies.length > 0) {
    const repliesContainer = document.createElement('div');
    repliesContainer.classList.add('replies-container', 'hidden-replies'); // Initially hidden

    // The repliesContainer itself does not add additional indentation or border here.
    // Its children (the replies) will handle their own indentation and border.

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
    commentItem.appendChild(showRepliesButton); // Add button to the parent comment

    comment.replies.sort((a, b) => {
      const dateA = a.timestamp ? a.timestamp.toDate() : new Date(0);
      const dateB = b.timestamp ? b.timestamp.toDate() : new Date(0);
      return dateA - dateB;
    });
    comment.replies.forEach(reply => {
      renderComment(reply, repliesContainer); // Recursive call
    });
    commentItem.appendChild(repliesContainer); // Append the container to the commentItem itself
  }
}

// Function para mag-load at mag-display ng comments
function loadComments(spotId) {
  const commentsDisplayArea = document.getElementById('comments-display-area');
  commentsDisplayArea.innerHTML = '<p style="text-align: center; color: #aaa;">Loading comments...</p>'; // Loading indicator

  if (unsubscribeComments) {
    unsubscribeComments();
    console.log("Unsubscribed previous comments listener.");
  }

  const commentsRef = collection(db, `artifacts/${appId}/public/data/comments`);
  const q = query(commentsRef);

  unsubscribeComments = onSnapshot(q, (snapshot) => {
    commentsDisplayArea.innerHTML = ''; // Clear current comments
    const commentsById = new Map();
    const rootComments = [];

    snapshot.forEach((doc) => {
      const commentData = { id: doc.id, ...doc.data() };
      commentsById.set(doc.id, commentData);
      if (!commentData.parentId) { // If no parentId, it's a root comment
        rootComments.push(commentData);
      }
    });

    // Link replies to their parents
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

    // Sort root comments by timestamp
    rootComments.sort((a, b) => {
      const dateA = a.timestamp ? a.timestamp.toDate() : new Date(0);
      const dateB = b.timestamp ? b.timestamp.toDate() : new Date(0);
      return dateA - dateB;
    });

    if (rootComments.length > 0) {
      rootComments.forEach((comment) => {
        if (comment.spotId === spotId) { // Only render comments for the current spot
          renderComment(comment, commentsDisplayArea);
        }
      });
    } else {
      commentsDisplayArea.innerHTML = '<p style="text-align: center; color: #aaa;">Walang komento pa. Maging una!</p>';
    }
  }, (error) => {
    console.error("Error loading comments (onSnapshot listener): ", error);
    commentsDisplayArea.innerHTML = '<p style="text-align: center; color: #ff5252;">Error loading comments.</p>';
  });
}


// Global functions para sa overlay, tinatawag mula sa HTML onclick
window.openOverlay = async (title, imageUrl, description, spotId) => {
  console.log("openOverlay function called for spotId:", spotId);
  currentSpotId = spotId;
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-img").src = imageUrl;
  document.getElementById("modal-desc").textContent = description;
  document.getElementById("overlay").style.display = "flex";
  console.log("Overlay display set to flex.");

  // Load directions content immediately
  const spotName = document.getElementById("modal-title").textContent;
  const destinationAddress = `${spotName}, Philippines`;
  let startAddress = "Manila, Philippines"; // Default starting point for Luzon

  // Customize starting point based on spotId for Luzon
  switch (spotId) {
    case 'spot-banauerice-nature':
      startAddress = "Banaue, Ifugao, Philippines";
      break;
    case 'spot-mtpulag-nature':
      startAddress = "Kabayan, Benguet, Philippines";
      break;
    case 'spot-taal-nature':
      startAddress = "Tagaytay City, Cavite, Philippines";
      break;
    case 'spot-hundredislands-nature':
      startAddress = "Alaminos City, Pangasinan, Philippines";
      break;
    case 'spot-mayon-nature':
      startAddress = "Legazpi City, Albay, Philippines";
      break;
    case 'spot-pagsanjanfalls-nature':
      startAddress = "Pagsanjan, Laguna, Philippines";
      break;
    case 'spot-masungi-nature':
      startAddress = "Baras, Rizal, Philippines";
      break;
    case 'spot-sabangbeach-nature':
      startAddress = "Baler, Aurora, Philippines";
      break;
    case 'spot-mtpulatubo-nature':
      startAddress = "Capas, Tarlac, Philippines";
      break;
    case 'spot-intramuros-hist':
      startAddress = "Manila, Philippines";
      break;
    case 'spot-vigan-hist':
      startAddress = "Vigan City, Ilocos Sur, Philippines";
      break;
    case 'spot-corregidor-hist':
      startAddress = "Mariveles, Bataan, Philippines";
      break;
    case 'spot-rizalpark-hist':
      startAddress = "Manila, Philippines";
      break;
    case 'spot-hoyopoyopan-hist':
      startAddress = "Camalig, Albay, Philippines";
      break;
    case 'spot-bataanmemorial-hist':
      startAddress = "Pilar, Bataan, Philippines";
      break;
    case 'spot-binondo-other':
      startAddress = "Manila, Philippines";
      break;
    case 'spot-banguiwindmills-other':
      startAddress = "Bangui, Ilocos Norte, Philippines";
      break;
    case 'spot-villaescudero-other':
      startAddress = "San Pablo City, Laguna, Philippines";
      break;
    case 'spot-sumaguingcave-other':
      startAddress = "Sagada, Mountain Province, Philippines";
      break;
    case 'spot-sagadahanging-other':
      startAddress = "Sagada, Mountain Province, Philippines";
      break;
    case 'spot-baguiocity-nature':
      startAddress = "Baguio City, Benguet, Philippines";
      break;
    case 'spot-barasoainchurch-hist':
      startAddress = "Malolos, Bulacan, Philippines";
      break;
    case 'spot-fortsantiago-hist':
      startAddress = "Intramuros, Manila, Philippines";
      break;
    case 'spot-sanagustin-hist':
      startAddress = "Intramuros, Manila, Philippines";
      break;
    case 'spot-nationalmuseum-hist':
      startAddress = "Manila, Philippines";
      break;
    case 'spot-baguiocathedral-other':
      startAddress = "Baguio City, Benguet, Philippines";
      break;
    case 'spot-burnhampark-other':
      startAddress = "Baguio City, Benguet, Philippines";
      break;
    case 'spot-campjohnhay-other':
      startAddress = "Baguio City, Benguet, Philippines";
      break;
    case 'spot-subicbay-other':
      startAddress = "Subic Bay Freeport Zone, Zambales, Philippines";
      break;
    case 'spot-clark-other':
      startAddress = "Clark Freeport Zone, Pampanga, Philippines";
      break;
  }

  const modalDirections = document.getElementById("modal-directions");
  modalDirections.innerHTML = `<h3>Directions and Tutorial</h3><p>Makikita mo ang mga direksyon mula sa **${startAddress}** patungo sa **${spotName}** sa mapa sa ibaba. Maaari mong baguhin ang panimulang punto sa Google Maps.</p><iframe src="https://maps.google.com/maps?saddr=${encodeURIComponent(startAddress)}&daddr=${encodeURIComponent(destinationAddress)}&output=embed" width="100%" height="300" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;

  // Load comments immediately as well
  loadComments(currentSpotId);
  // Check if the current spot is favorited and update the button
const user = auth.currentUser;
const favoriteModalBtn = document.getElementById("favoriteModalBtn");

if (user && favoriteModalBtn) {
  try {
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    const favorites = userDoc.exists() ? userDoc.data().favorites || [] : [];
    const isFavorited = favorites.some(f => f.id === currentSpotId);
    updateFavoriteButtonState(favoriteModalBtn, isFavorited);
    favoriteModalBtn.disabled = false;
    favoriteModalBtn.title = "";
  } catch (error) {
    console.error("Error checking favorite status in openOverlay:", error);
    updateFavoriteButtonState(favoriteModalBtn, false);
    favoriteModalBtn.disabled = true;
    favoriteModalBtn.title = "May error habang kinukuha ang estado ng paborito.";
  }
}

};

window.closeOverlay = () => {
  document.getElementById("overlay").style.display = "none";
  currentSpotId = null;
  // Reset comments and directions sections to their initial state with headings
  document.getElementById("modal-directions").innerHTML = '<h3>Directions and Tutorial</h3>';
  document.getElementById("modal-comment-section").innerHTML = '<h3>Comments</h3><div id="comments-display-area" class="comments-display-area"></div><div id="comment-message-area" style="display: none;"></div><div class="comment-input-area"><textarea id="comment-input" placeholder="Isulat ang iyong komento..." disabled></textarea><button id="submit-comment-btn" disabled>Submit</button></div>';
  showTemporaryMessage('');

  if (unsubscribeComments) {
    unsubscribeComments();
    unsubscribeComments = null;
    console.log("Comments listener unsubscribed on overlay close.");
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  console.log("DOMContentLoaded event fired.");
  const favoriteModalBtn = document.getElementById("favoriteModalBtn");
  if (favoriteModalBtn) {
    console.log("Favorite button found.");
    favoriteModalBtn.addEventListener("click", async () => {
      console.log("Favorite button clicked.");
      const user = auth.currentUser;
      if (!user) {
        showTemporaryMessage("Mangyaring mag-log in para mag-save ng paborito.", true);
        console.log("Mangyaring mag-log in para mag-save ng paborito.");
        return;
      }

      if (!currentSpotId) {
        showTemporaryMessage("Walang spot na napili sa modal.", true);
        console.log("Walang spot na napili sa modal.");
        return;
      }

      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        const favorites = userDoc.exists() ? userDoc.data().favorites || [] : [];

        const isCurrentlyFavoritedInModal = favoriteModalBtn.classList.contains('favorited');
        const spotName = document.getElementById("modal-title").textContent;
        const imageUrl = document.getElementById("modal-img").src;
        const description = document.getElementById("modal-desc").textContent;
        const favoriteObj = { id: currentSpotId, name: spotName, image: imageUrl, description: description };

        if (isCurrentlyFavoritedInModal) {
          await updateDoc(userDocRef, { favorites: arrayRemove(favoriteObj) });
          updateFavoriteButtonState(favoriteModalBtn, false);
          showTemporaryMessage(`${spotName} inalis mula sa mga paborito.`, false);
          console.log(`${spotName} inalis mula sa mga paborito.`);
        } else {
          await updateDoc(userDocRef, { favorites: arrayUnion(favoriteObj) });
          updateFavoriteButtonState(favoriteModalBtn, true);
          showTemporaryMessage(`${spotName} idinagdag sa mga paborito.`, false);
          console.log(`${spotName} idinagdag sa mga paborito.`);
        }

      } catch (error) {
        console.error('Error sa pag-update ng mga paborito:', error);
        showTemporaryMessage('Nabigo ang pag-update ng mga paborito. Tingnan ang console.', true);
        console.log('Nabigo ang pag-update ng mga paborito.');
      }
    });
  } else {
    console.warn("Favorite button (favoriteModalBtn) not found in DOM.");
  }

  // Event listener for submitting a top-level comment
  const submitCommentBtn = document.getElementById("submit-comment-btn");
  if (submitCommentBtn) {
    console.log("Submit comment button found.");
    submitCommentBtn.addEventListener("click", async () => {
      console.log("Submit comment button clicked.");
      const commentInput = document.getElementById("comment-input");
      const commentText = commentInput.value.trim();
      const user = auth.currentUser;

      if (!user) {
        showTemporaryMessage("Mangyaring mag-log in para mag-komento.", true);
        console.log("Mangyaring mag-log in para mag-komento.");
        return;
      }

      if (!commentText) {
        showTemporaryMessage("Walang laman ang komento. Mangyaring maglagay ng komento.", true);
        console.log("Walang laman ang komento.");
        return;
      }

      if (!currentSpotId) {
        showTemporaryMessage("Walang spot na napili para sa komento.", true);
        console.log("Walang spot na napili para sa komento.");
        return;
      }

      try {
        await addDoc(collection(db, `artifacts/${appId}/public/data/comments`), {
          spotId: currentSpotId,
          userId: user.uid,
          userName: user.displayName || user.email || 'Anonymous',
          commentText: commentText,
          timestamp: new Date(),
          parentId: null // Top-level comment
        });
        commentInput.value = '';
        showTemporaryMessage("Komento naidagdag na!", false);
        console.log("Komento naidagdag na!");
      } catch (error) {
        console.error("Error sa pagdagdag ng komento:", error);
        showTemporaryMessage("Nabigo ang pagdagdag ng komento. Subukang muli. Tingnan ang console para sa detalye.", true);
        console.log("Nabigo ang pagdagdag ng komento.");
      }
    });
  } else {
    console.warn("Submit comment button (submit-comment-btn) not found in DOM.");
  }

  // I-initialize ang mga scroll button
  document.querySelectorAll('.scroll-wrapper').forEach(wrapper => {
    const scrollRow = wrapper.querySelector('.scroll-row');
    const leftBtn = wrapper.querySelector('.scroll-btn.left');
    const rightBtn = wrapper.querySelector('.scroll-btn.right');

    if (leftBtn && rightBtn && scrollRow) {
      leftBtn.addEventListener('click', () => {
        scrollRow.scrollBy({ left: -300, behavior: 'smooth' });
      });

      rightBtn.addEventListener('click', () => {
        scrollRow.scrollBy({ left: 300, behavior: 'smooth' });
      });
      console.log("Scroll buttons initialized.");
    } else {
      console.warn("Scroll buttons or scroll row not found for a wrapper.");
    }
  });

  // Firebase Authentication State Listener
  onAuthStateChanged(auth, async (user) => {
    console.log('Authentication state changed. User:', user ? user.uid : "null");
    const commentInput = document.getElementById("comment-input");
    const submitCommentBtn = document.getElementById("submit-comment-btn");
    const favoriteModalBtn = document.getElementById("favoriteModalBtn");

    // Enable/disable main comment input and submit button
    if (commentInput) {
        commentInput.disabled = !user;
        commentInput.placeholder = user ? "Isulat ang iyong komento..." : "Mangyaring mag-log in para mag-komento.";
    }
    if (submitCommentBtn) {
        submitCommentBtn.disabled = !user;
    }

    // Enable/disable reply buttons and inputs
    document.querySelectorAll('.reply-button').forEach(button => {
        button.disabled = !user;
    });
    document.querySelectorAll('.reply-input-area textarea').forEach(textarea => {
        textarea.disabled = !user;
    });
    document.querySelectorAll('.reply-input-area button').forEach(button => {
        button.disabled = !user;
    });


    if (user) {
      currentUserId = user.uid;
      console.log('Nakalog-in ang user:', user.uid);

      if (currentSpotId && favoriteModalBtn) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);
          const favorites = userDoc.exists() ? userDoc.data().favorites || [] : [];
          const isFavorited = favorites.some(f => f.id === currentSpotId);
          updateFavoriteButtonState(favoriteModalBtn, isFavorited);
          favoriteModalBtn.disabled = false;
          console.log("Favorite button updated based on user login.");
        } catch (error) {
          console.error("Error updating favorite button on auth state change:", error);
          updateFavoriteButtonState(favoriteModalBtn, false);
          favoriteModalBtn.disabled = true;
          favoriteModalBtn.title = 'Mangyaring mag-log in para mag-paborito.';
        }
      }
    } else {
      currentUserId = null;
      console.log('Hindi nakalog-in');
      if (favoriteModalBtn) {
        updateFavoriteButtonState(favoriteModalBtn, false);
        favoriteModalBtn.disabled = true;
        favoriteModalBtn.title = 'Mangyaring mag-log in para mag-paborito.';
      }

      if (!initialAuthToken) {
        console.log("Attempting anonymous sign-in as no initialAuthToken is present.");
        try {
          await signInAnonymously(auth);
          console.log("Successfully signed in anonymously.");
        } catch (error) {
          console.error("Error signing in anonymously:", error);
        }
      }
    }
  });

  if (initialAuthToken) {
    console.log("Attempting sign-in with custom token.");
    try {
      await signInWithCustomToken(auth, initialAuthToken);
      console.log("Successfully signed in with custom token.");
    } catch (error) {
      console.error("Error signing in with custom token:", error);
      console.log("Falling back to anonymous sign-in after custom token failure.");
      try {
        await signInAnonymously(auth);
        console.log("Successfully signed in anonymously after custom token failure.");
      } catch (anonError) {
        console.error("Error signing in anonymously after custom token failure:", anonError);
      }
    }
  } else {
    console.log("No initialAuthToken, relying on onAuthStateChanged for anonymous sign-in.");
  }

 const burger = document.getElementById("burgerMenu");
const dropdown = document.getElementById("dropdownMenu");

// Handle toggle for spin and dropdown
burger.addEventListener("click", () => {
  burger.classList.toggle("open");    // Toggles the 'open' class for the spin effect
  dropdown.classList.toggle("show");  // Toggles the 'show' class for the dropdown
});
// --- Search Functionality ---
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.querySelector('.search-input');
  const searchBtn = document.querySelector('.search-btn');
  const spotCards = document.querySelectorAll('.spot-card'); // Get all spot cards

  /**
   * Filters the spot cards based on the search input.
   */
  const filterSpotCards = () => {
    const searchTerm = searchInput.value.toLowerCase(); // Convert search term to lowercase
    
    spotCards.forEach(card => {
      const title = card.querySelector('h3').textContent.toLowerCase();
      const description = card.querySelector('p') ? card.querySelector('p').textContent.toLowerCase() : ''; // Get description if exists

      if (title.includes(searchTerm) || description.includes(searchTerm)) {
        card.style.display = 'block'; // Show the card
      } else {
        card.style.display = 'none'; // Hide the card
      }
    });
  };

  // Event listener for the search button click
  if (searchBtn) {
    searchBtn.addEventListener('click', filterSpotCards);
  }

  // Event listener for 'keyup' on the search input for real-time filtering
  if (searchInput) {
    searchInput.addEventListener('keyup', filterSpotCards);
  }
});

// --- Scroll Button Functionality (Existing) ---
document.addEventListener('DOMContentLoaded', () => {
  const scrollWrappers = document.querySelectorAll('.scroll-wrapper');

  scrollWrappers.forEach(wrapper => {
    const scrollRow = wrapper.querySelector('.scroll-row');
    const leftBtn = wrapper.querySelector('.scroll-btn.left');
    const rightBtn = wrapper.querySelector('.scroll-btn.right');

    if (leftBtn && scrollRow) {
      leftBtn.addEventListener('click', () => {
        scrollRow.scrollBy({
          left: -300, // Scroll by 300px to the left
          behavior: 'smooth'
        });
      });
    }

    if (rightBtn && scrollRow) {
      rightBtn.addEventListener('click', () => {
        scrollRow.scrollBy({
          left: 300, // Scroll by 300px to the right
          behavior: 'smooth'
        });
      });
    }
  });
  });


  const logoutButton = document.getElementById("logoutBtn");

if (logoutButton) {
  console.log("Logout button (id=logoutBtn) element found."); // Added log
  logoutButton.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Logout button clicked. Attempting signOut..."); // Added log
    signOut(auth)
      .then(() => {
        alert("You have been logged out.");
        window.location.href = "login.html";
        console.log("Logout successful. Redirecting to login.html"); // Added log
      })
      .catch((error) => {
        console.error("Logout failed:", error); // **This is the critical log we need to see!**
        alert("Logout failed: " + error.message); // Added error message to alert for user visibility
      });
    });
  } else {
    console.warn("Logout button (id=logoutBtn) element NOT found in DOM."); // Added warning if not found
  }

      document.getElementById("luzon")?.addEventListener("click", () => {
    window.location.href = "luzon.html";
    });

    document.getElementById("visayas")?.addEventListener("click", () => {
    window.location.href = "visayas.html";
    });

    document.getElementById("mindanao")?.addEventListener("click", () => {
    window.location.href = "mindanao.html";
  });
});
  const slider = document.getElementById("top10Slider");
  const slides = slider.querySelectorAll(".top10-slide");
  let index = 0;

  function showSlide(i) {
    slider.style.transform = `translateX(-${i * 100}%)`;
  }

  function nextSlide() {
    index = (index + 1) % slides.length;
    showSlide(index);
  }

  setInterval(nextSlide, 4000); // 4 seconds
  window.addEventListener("load", () => showSlide(index));

