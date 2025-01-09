import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA6jKCgyTeTnfL-pRoZlKwIJjEcUMkAR_Y",
  authDomain: "think-realty-d81d2.firebaseapp.com",
  projectId: "think-realty-d81d2",
  storageBucket: "think-realty-d81d2.firebasestorage.app",
  messagingSenderId: "155649322864",
  appId: "1:155649322864:web:25adc5b892d9985f3e69b5",
  measurementId: "G-ZFP3YJNG4B"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);