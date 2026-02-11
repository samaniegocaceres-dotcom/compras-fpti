
// firebase.js  (colócalo en la raíz junto a index.html y app.js)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDfHyYsCQdvREqc-j93ayR0tuhLTYDBjqw",
  authDomain: "compras-fpti.firebaseapp.com",
  databaseURL: "https://compras-fpti-default-rtdb.firebaseio.com",
  projectId: "compras-fpti",
  storageBucket: "compras-fpti.firebasestorage.app",
  messagingSenderId: "951080191264",
  appId: "1:951080191264:web:3767f95e7319eaea7fc345",
  measurementId: "G-Z31T0TM6ZK"
};

export const app = initializeApp(firebaseConfig);
export const db  = getDatabase(app);

