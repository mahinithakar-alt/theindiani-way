THE INDIANI WAY - CLIENT TEST PACKAGE
=====================================

HOW TO OPEN (Windows 10 / Windows 11)
1. Extract the complete ZIP folder.
2. Open the extracted folder.
3. Double-click START.bat.
4. Your browser should open the website automatically.
5. Keep the black server window open while testing.
6. Close the black window when finished.

IMPORTANT
- Do not open index.html or admin.html by double-clicking them directly.
- Always start the site with START.bat. It serves the pages through localhost,
  which is required for Firebase JavaScript modules.
- This launcher uses Windows PowerShell already included with Windows 10/11.
  It does not require Python, Node.js, or VS Code.
- An internet connection is required for Firebase and externally hosted assets.

FEATURE LIMITATIONS TO NOTE
- Customer pages, Firebase sign-in, and Firestore-based product functions can
  work when Firebase is configured correctly and the browser can reach Firebase.
- The existing api/index.js backend is a separate Express server. This package
  does not start that backend.
- Therefore API-dependent product image upload and order-email functions will
  not work from this ZIP alone unless the secure backend is separately deployed
  and configured. Do not put service-account keys, Supabase secret keys, or
  email-provider API keys in this ZIP.

If Windows shows a security prompt, only run the files if you trust the source
of this project package. The server listens only on this computer (127.0.0.1).
