// luzon.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, updateDoc, arrayUnion, arrayRemove, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDoijFlD_hJ2mp4FstfSZO4qUPKIzEdmPs",
  authDomain: "hello-e7a6d.firebaseapp.com",
  projectId: "hello-e7a6d",
  storageBucket: "hello-e7a6d.appspot.com",
  messagingSenderId: "693146874206",
  appId: "1:693146874206:web:d37f7a3c823fcba4401fcf"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function setupFavorites() {
  const rows = document.querySelectorAll('.scroll-row');
  rows.forEach((row) => {
    const cards = row.querySelectorAll('.card');
    cards.forEach((card) => {
      if (!card.querySelector('.favorite-btn')) {
        const button = document.createElement('button');
        button.classList.add('favorite-btn');
        button.innerHTML = '♡'; // unfilled heart
        card.appendChild(button);

        const spotName = card.querySelector('h3')?.textContent.trim();
        const imageSrc = card.querySelector('img')?.getAttribute('src') || '';
        const spotDescription = card.querySelector('p')?.textContent || '';

        button.addEventListener('click', async () => {
          const user = auth.currentUser;
          if (!user) {
            alert('You must be logged in to favorite. Redirecting to login...');
            window.location.href = 'login.html';
            return;
          }

          const userDocRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userDocRef);
          const favoriteObj = { name: spotName, image: imageSrc, description: spotDescription };

          try {
            if (userSnap.exists()) {
              const currentFavorites = userSnap.data().favorites || [];

              const alreadyFavorited = currentFavorites.some(fav => fav.name === spotName);

              if (alreadyFavorited) {
                const updatedFavorites = currentFavorites.filter(fav => fav.name !== spotName);
                await updateDoc(userDocRef, { favorites: updatedFavorites });
                button.classList.remove('favorited');
                button.innerHTML = '♡';
                alert(`${spotName} removed from favorites.`);
              } else {
                await updateDoc(userDocRef, {
                  favorites: arrayUnion(favoriteObj)
                });
                button.classList.add('favorited');
                button.innerHTML = '❤️';
                alert(`${spotName} added to favorites.`);
              }
            } else {
              await setDoc(userDocRef, {
                favorites: [favoriteObj]
              });
              button.classList.add('favorited');
              button.innerHTML = '❤️';
              alert(`${spotName} added to favorites.`);
            }
          } catch (error) {
            console.error('Error updating favorites:', error);
            alert('Failed to update favorites.');
          }
        });
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      setupFavorites();
    } else {
      console.log('Not logged in');
    }
  });
});
