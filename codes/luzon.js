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

let currentSpotId = null; // Para masubaybayan ang kasalukuyang bukas na spot sa modal

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

// Global functions para sa overlay, tinatawag mula sa HTML onclick
window.openOverlay = async (title, imageUrl, description, spotId) => {
  currentSpotId = spotId; // Itago ang ID ng binuksang spot
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-img").src = imageUrl;
  document.getElementById("modal-desc").textContent = description;
  document.getElementById("overlay").style.display = "flex";

  const favoriteModalBtn = document.getElementById("favoriteModalBtn");
  const user = auth.currentUser;

  if (user) {
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    const favorites = userDoc.exists() ? userDoc.data().favorites || [] : [];
    const isFavorited = favorites.some(f => f.id === currentSpotId);
    updateFavoriteButtonState(favoriteModalBtn, isFavorited);
    favoriteModalBtn.disabled = false;
  } else {
    updateFavoriteButtonState(favoriteModalBtn, false); // Ipakita bilang hindi paborito
    favoriteModalBtn.disabled = true;
    favoriteModalBtn.title = 'Mangyaring mag-log in para mag-paborito.';
  }

  // Hide and clear directions when a new overlay is opened
  document.getElementById("modal-directions").style.display = "none";
  document.getElementById("modal-directions").innerHTML = '';
};

window.closeOverlay = () => {
  document.getElementById("overlay").style.display = "none";
  currentSpotId = null; // I-clear ang kasalukuyang spot ID
  document.getElementById("modal-directions").style.display = "none"; // Hide directions on close
  document.getElementById("modal-directions").innerHTML = ''; // Clear directions content
};

// Event listener para sa favorite button ng modal
document.addEventListener('DOMContentLoaded', () => {
  const favoriteModalBtn = document.getElementById("favoriteModalBtn");
  if (favoriteModalBtn) {
    favoriteModalBtn.addEventListener("click", async () => {
      const user = auth.currentUser;
      if (!user) {
        console.log("Mangyaring mag-log in para mag-save ng paborito.");
        return;
      }

      if (!currentSpotId) {
        console.log("Walang spot na napili sa modal.");
        return;
      }

      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      const favorites = userDoc.exists() ? userDoc.data().favorites || [] : [];

      const isCurrentlyFavoritedInModal = favoriteModalBtn.classList.contains('favorited');
      const spotName = document.getElementById("modal-title").textContent;
      const imageUrl = document.getElementById("modal-img").src;
      const description = document.getElementById("modal-desc").textContent; // Kunin ang description mula sa modal
      const favoriteObj = { id: currentSpotId, name: spotName, image: imageUrl, description: description };

      try {
        if (isCurrentlyFavoritedInModal) {
          await updateDoc(userDocRef, { favorites: arrayRemove(favoriteObj) });
          updateFavoriteButtonState(favoriteModalBtn, false);
          console.log(`${spotName} inalis mula sa mga paborito.`);
        } else {
          await updateDoc(userDocRef, { favorites: arrayUnion(favoriteObj) });
          updateFavoriteButtonState(favoriteModalBtn, true);
          console.log(`${spotName} idinagdag sa mga paborito.`);
        }

      } catch (error) {
        console.error('Error sa pag-update ng mga paborito:', error);
        console.log('Nabigo ang pag-update ng mga paborito.');
      }
    });
  }

  // Event listener for the directions button
  const directionModalBtn = document.getElementById("directionModalBtn");
  if (directionModalBtn) {
    directionModalBtn.addEventListener("click", () => {
      const modalDirections = document.getElementById("modal-directions");
      const spotName = document.getElementById("modal-title").textContent;
      const spotId = currentSpotId; // Gamitin ang currentSpotId para matukoy ang specific na direksyon

      let startAddress = "Manila, Philippines"; // Default starting point for Luzon

      // Customize starting point based on spotId for Visayas
      switch (spotId) {
        // Luzon cases (already present)
        case 'spot-baguio':
          startAddress = "Baguio City, Philippines";
          break;
        case 'spot-vigan':
          startAddress = "Vigan City, Ilocos Sur, Philippines";
          break;
        case 'spot-elnido':
          startAddress = "El Nido, Palawan, Philippines";
          break;
        case 'spot-coron':
          startAddress = "Coron, Palawan, Philippines";
          break;
        case 'spot-intramuros':
          startAddress = "Manila, Philippines";
          break;
        case 'spot-taal':
          startAddress = "Tagaytay City, Cavite, Philippines";
          break;
        case 'spot-subic':
          startAddress = "Subic Bay, Zambales, Philippines";
          break;
        case 'spot-tagaytay':
          startAddress = "Tagaytay City, Cavite, Philippines";
          break;
        case 'spot-hundred-islands':
          startAddress = "Alaminos City, Pangasinan, Philippines";
          break;
        case 'spot-launion':
          startAddress = "San Juan, La Union, Philippines";
          break;
        case 'spot-pangasinan':
          startAddress = "Dagupan City, Pangasinan, Philippines";
          break;
        case 'spot-corregidor':
          startAddress = "Mariveles, Bataan, Philippines"; // Access point to Corregidor
          break;
        case 'spot-barasoain':
          startAddress = "Malolos City, Bulacan, Philippines";
          break;
        case 'spot-mtsamat':
          startAddress = "Pilar, Bataan, Philippines";
          break;
        case 'spot-rizalpark':
          startAddress = "Manila, Philippines";
          break;
        case 'spot-mayon':
          startAddress = "Legazpi City, Albay, Philippines";
          break;
        case 'spot-banaue':
          startAddress = "Banaue, Ifugao, Philippines";
          break;
        case 'spot-pinatubo':
          startAddress = "Capas, Tarlac, Philippines"; // Jump-off point for Pinatubo trek
          break;
        case 'spot-donsol':
          startAddress = "Donsol, Sorsogon, Philippines";
          break;

        // Visayas cases
        case 'spot-cebu':
          startAddress = "Mactan-Cebu International Airport, Philippines"; // Updated starting point
          break;
        case 'spot-boracay':
          startAddress = "Caticlan Jetty Port, Malay, Aklan, Philippines"; // Common entry point for Boracay
          break;
        case 'spot-bohol':
          startAddress = "Tagbilaran City, Bohol, Philippines";
          break;
        case 'spot-siquijor':
          startAddress = "Siquijor Port, Siquijor, Philippines";
          break;
        case 'spot-dumaguete':
          startAddress = "Dumaguete City, Negros Oriental, Philippines";
          break;
        case 'spot-iloilo':
          startAddress = "Iloilo City, Iloilo, Philippines";
          break;
        case 'spot-bacolod':
          startAddress = "Bacolod City, Negros Occidental, Philippines";
          break;
        case 'spot-leyte':
          startAddress = "Tacloban City, Leyte, Philippines";
          break;
        case 'spot-samar':
          startAddress = "Catbalogan City, Samar, Philippines";
          break;
        case 'spot-magellanscross':
          startAddress = "Cebu City, Philippines";
          break;
        case 'spot-fortsanpedro':
          startAddress = "Cebu City, Philippines";
          break;
        case 'spot-mactanshrine':
          startAddress = "Mactan Island, Cebu, Philippines";
          break;
        case 'spot-bloodcompact':
          startAddress = "Tagbilaran City, Bohol, Philippines";
          break;
        case 'spot-sanjuanicobridge':
          startAddress = "Tacloban City, Leyte, Philippines";
          break;
        case 'spot-kawasanfalls':
          startAddress = "Moalboal, Cebu, Philippines";
          break;
        case 'spot-chocolatehills':
          startAddress = "Carmen, Bohol, Philippines";
          break;
        case 'spot-malapascua':
          startAddress = "Malapascua Island, Cebu, Philippines";
          break;
        case 'spot-kalanggaman':
          startAddress = "Palompon, Leyte, Philippines";
          break;
        case 'spot-bantayan':
          startAddress = "Bantayan Island, Cebu, Philippines";
          break;

        // Mindanao cases (will be added when user requests Mindanao)
        case 'spot-davaocity':
          startAddress = "Davao City, Philippines";
          break;
        case 'spot-siargao':
          startAddress = "Siargao Island, Surigao del Norte, Philippines";
          break;
        case 'spot-cagayandeoro':
          startAddress = "Cagayan de Oro City, Misamis Oriental, Philippines";
          break;
        case 'spot-camiguin':
          startAddress = "Camiguin Island, Philippines";
          break;
        case 'spot-zamboangacity':
          startAddress = "Zamboanga City, Philippines";
          break;
        case 'spot-generalsantos':
          startAddress = "General Santos City, Philippines";
          break;
        case 'spot-lakesebu':
          startAddress = "Lake Sebu, South Cotabato, Philippines";
          break;
        case 'spot-dahilayan':
          startAddress = "Manolo Fortich, Bukidnon, Philippines";
          break;
        case 'spot-dinagatislands':
          startAddress = "San Jose, Dinagat Islands, Philippines";
          break;
        case 'spot-enchantedriver':
          startAddress = "Hinatuan, Surigao del Sur, Philippines";
          break;
        case 'spot-fortpilar':
          startAddress = "Zamboanga City, Philippines";
          break;
        case 'spot-rizalshrine':
          startAddress = "Dapitan City, Zamboanga del Norte, Philippines";
          break;
        case 'spot-davaomuseum':
          startAddress = "Davao City, Philippines";
          break;
        case 'spot-holyinfantjesus':
          startAddress = "Davao City, Philippines";
          break;
        case 'spot-monfortbatsanctuary':
          startAddress = "Samal Island, Davao del Norte, Philippines";
          break;
        case 'spot-mountapo':
          startAddress = "Kidapawan City, Cotabato, Philippines"; // One of the jump-off points
          break;
        case 'spot-tinuyanfalls':
          startAddress = "Bislig City, Surigao del Sur, Philippines";
          break;
        case 'spot-samalisland':
          startAddress = "Samal Island, Davao del Norte, Philippines";
          break;
        case 'spot-britaniaislands':
          startAddress = "San Agustin, Surigao del Sur, Philippines";
          break;
        case 'spot-asikasikfalls':
          startAddress = "Alamada, Cotabato, Philippines";
          break;
      }

      const destinationAddress = `${spotName}, Philippines`;

      if (modalDirections.style.display === "none") {
        // I-clear ang nakaraang content
        modalDirections.innerHTML = '';

        // Idagdag ang textual na hakbang
        const stepsParagraph = document.createElement('p');
        stepsParagraph.innerHTML = `Makikita mo ang mga direksyon mula sa **${startAddress}** patungo sa **${spotName}** sa mapa sa ibaba. Maaari mong baguhin ang panimulang punto sa Google Maps.`;
        modalDirections.appendChild(stepsParagraph);

        // Idagdag ang iframe para sa Google Maps na may direksyon
        const mapIframe = document.createElement('iframe');
        mapIframe.src = `https://maps.google.com/maps?saddr=${encodeURIComponent(startAddress)}&daddr=${encodeURIComponent(destinationAddress)}&output=embed`;
        mapIframe.width = "100%";
        mapIframe.height = "300"; // Fixed height para sa mapa
        mapIframe.style.border = "0";
        mapIframe.allowFullscreen = true;
        mapIframe.loading = "lazy";
        mapIframe.referrerPolicy = "no-referrer-when-downgrade";
        modalDirections.appendChild(mapIframe);

        modalDirections.style.display = "block";
      } else {
        modalDirections.style.display = "none";
        modalDirections.innerHTML = ''; // I-clear ang content kapag tinago
      }
    });
  }

  // I-initialize ang mga scroll button
  document.querySelectorAll('.scroll-wrapper').forEach(wrapper => {
    const scrollRow = wrapper.querySelector('.scroll-row');
    const leftBtn = wrapper.querySelector('.scroll-btn.left');
    const rightBtn = wrapper.querySelector('.scroll-btn.right');

    leftBtn.addEventListener('click', () => {
      scrollRow.scrollBy({ left: -300, behavior: 'smooth' });
    });

    rightBtn.addEventListener('click', () => {
      scrollRow.scrollBy({ left: 300, behavior: 'smooth' });
    });
  });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log('Nakalog-in ang user:', user.uid);
    } else {
      console.log('Hindi nakalog-in');
      // Kung naka-log out, siguraduhin na disabled ang favorite button ng modal kung bukas.
      const favoriteModalBtn = document.getElementById("favoriteModalBtn");
      if (favoriteModalBtn) {
        updateFavoriteButtonState(favoriteModalBtn, false);
        favoriteModalBtn.disabled = true;
        favoriteModalBtn.title = 'Mangyaring mag-log in para mag-paborito.';
      }
    }
  });
});
