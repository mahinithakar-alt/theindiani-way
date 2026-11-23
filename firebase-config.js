
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDa6ELuHaw1YxJ2yZXQJOyVr8AJsXsXmKs",
  authDomain: "the-indiani-way-c1a0e.firebaseapp.com",
  projectId: "the-indiani-way-c1a0e",
  storageBucket: "the-indiani-way-c1a0e.firebasestorage.app",
  messagingSenderId: "885626767508",
  appId: "1:885626767508:web:67781770d78fd63c14cc81",
  measurementId: "G-0FB6LFRQGP"
};

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);

window.FirebaseApp = app;
window.FirebaseAuth = auth;
window.FirebaseDB = db;

export { app, auth, db };
