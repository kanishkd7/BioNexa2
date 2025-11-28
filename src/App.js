import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
import logo from './assets/logo2.jpg';
import { auth } from './firebase';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import Dashboard from './components/Dashboard';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import DoctorDashboard from './components/DoctorDashboard';
import { addDoc, collection } from 'firebase/firestore';

function App() {
  const navigate = useNavigate();
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: ''
  });
  const [isDoctorSignup, setIsDoctorSignup] = useState(false);
  const [signupFormData, setSignupFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    specialization: '',
    expertise: '',
    experience: '',
    education: '',
    patients: '',
    description: '',
    availableDates: [],
    availableSlots: []
  });
  const [error, setError] = useState('');
  const [userSignupFormData, setUserSignupFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [isDoctorLogin, setIsDoctorLogin] = useState(false);
  const [doctorLoginData, setDoctorLoginData] = useState({
    email: '',
    doctorId: '',
    password: ''
  });
  const [userType, setUserType] = useState(null);
  const [user, setUser] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('You are back online');
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.error('You are offline. Some features may be unavailable.');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Store the user regardless of email verification status
        setUser(user);
        
        console.log('Auth state changed, user detected:', user.email);
        console.log('Email verification status:', user.emailVerified);
        
        // Make sure to get the latest email verification status
        await user.reload();
        console.log('After reload, email verification status:', user.emailVerified);
        
        // Check if this user is a doctor by making a request to our backend
        try {
          const response = await fetch(`http://localhost:5000/api/doctors/check-uid/${user.uid}`);
          const data = await response.json();
          
          if (data.exists) {
            console.log('Doctor found in database:', data.doctor);
            
            // This is a doctor, check Firebase email verification
            if (user.emailVerified) {
              console.log('Firebase indicates email is verified for doctor');
              
              // If Firebase shows verified but backend doesn't, update backend
              if (!data.doctor.isVerified) {
                console.log('Syncing verification status to backend');
                try {
                  const verifyResponse = await fetch('http://localhost:5000/api/doctors/verify-by-email', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email: user.email })
                  });
                  
                  if (verifyResponse.ok) {
                    console.log('Successfully verified doctor in backend');
                  } else {
                    console.error('Failed to verify doctor in backend');
                  }
                } catch (verifyError) {
                  console.error('Error verifying doctor in backend:', verifyError);
                }
              }
              
              // Set user as authenticated and proceed
              setUserType('doctor');
              setIsAuthenticated(true);
            } else {
              // Email not verified in Firebase
              console.log('Doctor email not verified in Firebase, signing out');
              toast.error('Please verify your email before logging in. Check your inbox for a verification link.');
              await signOut(auth);
              setUser(null);
              setUserType(null);
              return;
            }
          } else {
            // This is a regular user, check email verification
            if (!user.emailVerified) {
              toast.error('Please verify your email before logging in');
              await signOut(auth);
              setUser(null);
              setUserType(null);
              return;
            }
            setUserType('user');
            setIsAuthenticated(true);
          }
        } catch (error) {
          console.error('Error checking if user is a doctor:', error);
          
          // Before falling back to email verification,
          // try one more check to see if this might be a doctor by email
          try {
            const emailResponse = await fetch('http://localhost:5000/api/doctors/find/' + user.email);
            const emailData = await emailResponse.json();
            
            if (emailData.found) {
              console.log('Doctor found by email, reload user to get updated email verification status');
              
              // Make sure we have the latest verification status
              await user.reload();
              
              if (!user.emailVerified) {
                console.log('Email not verified after reload');
                toast.error('Please verify your email before logging in');
                await signOut(auth);
                setUser(null);
                setUserType(null);
                return;
              }
              
              console.log('Email verified, allowing login and updating doctor UID');
              // Update the doctor's UID while we're at it
              await fetch(`http://localhost:5000/api/doctors/${emailData.doctor._id}/update-uid`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ uid: user.uid })
              });
              
              setUserType('doctor');
              setIsAuthenticated(true);
              return;
            }
          } catch (emailError) {
            console.error('Error checking doctor by email:', emailError);
          }
          
          // Finally, fall back to requiring email verification
          if (!user.emailVerified) {
            toast.error('Please verify your email before logging in');
            await signOut(auth);
            setUser(null);
            setUserType(null);
            return;
          }
          setIsAuthenticated(true);
        }
      } else {
        setUser(null);
        setUserType(null);
        setIsAuthenticated(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Add a new useEffect to handle email verification
  useEffect(() => {
    // Check if we have a verification email flag in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const verifyEmail = urlParams.get('verifyEmail');
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode');

    // If this is an email verification redirect
    if (verifyEmail === 'true' || (mode === 'verifyEmail' && oobCode)) {
      console.log('Email verification redirect detected');
      
      // Show a toast that we're verifying their email
      toast.info('Verifying your email...', { autoClose: false, toastId: 'verifying-email' });

      // If we have an oobCode, use it to verify the email
      if (oobCode) {
        // Import the applyActionCode function if it's not already imported
        import('firebase/auth').then(({ applyActionCode }) => {
          // Apply the action code to verify the email
          applyActionCode(auth, oobCode)
            .then(() => {
              // Email successfully verified
              toast.dismiss('verifying-email');
              toast.success('Email verified successfully. You can now log in.');
              
              // Clear the verification params from the URL
              const newUrl = window.location.protocol + "//" + 
                             window.location.host + 
                             window.location.pathname;
              window.history.replaceState({}, document.title, newUrl);
              
              // Show the login form
              setShowLogin(true);
            })
            .catch((error) => {
              // Error verifying email
              toast.dismiss('verifying-email');
              console.error('Error verifying email:', error);
              
              // Handle specific error codes
              if (error.code === 'auth/invalid-action-code') {
                toast.error('The verification link has expired or is invalid. Please request a new one.');
              } else if (error.code === 'auth/user-not-found') {
                toast.error('User not found. The account may have been deleted.');
              } else {
                toast.error('Failed to verify email. Please try again or request a new verification link.');
              }
              
              // Clear the verification params from the URL
              const newUrl = window.location.protocol + "//" + 
                             window.location.host + 
                             window.location.pathname;
              window.history.replaceState({}, document.title, newUrl);
            });
        });
      } else {
        // If we don't have an oobCode, let the user know they need to check their email
        toast.dismiss('verifying-email');
        toast.info('Please check your email for a verification link.');
        
        // Clear the verification params from the URL
        const newUrl = window.location.protocol + "//" + 
                       window.location.host + 
                       window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      if (isDoctorLogin) {
        console.log('Doctor login attempt:', doctorLoginData);
        
        // First, try to ensure doctor is verified in backend if they've already verified in Firebase
        try {
          // Try Firebase login first to check email verification status
          console.log('Attempting Firebase login first to check email verification status');
          const userCredential = await signInWithEmailAndPassword(
            auth,
            doctorLoginData.email,
            doctorLoginData.password
          );
          
          // Ensure we have the latest user data
          await userCredential.user.reload();
          
          // Check if email is verified in Firebase
          if (userCredential.user.emailVerified) {
            console.log('Email is verified in Firebase, ensuring backend is in sync');
            
            // Check if this doctor exists and what their verification status is
            const checkResponse = await fetch(`http://localhost:5000/api/doctors/find/${doctorLoginData.email}`);
            const checkData = await checkResponse.json();
            
            if (checkData.found) {
              console.log('Doctor found in database:', checkData.doctor);
              
              // If not verified in backend, attempt to verify them
              if (!checkData.doctor.isVerified) {
                console.log('Doctor not verified in backend, attempting to verify...');
                
                // Try to verify the doctor in the backend
                const verifyResponse = await fetch('http://localhost:5000/api/doctors/verify-by-email', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ email: doctorLoginData.email })
                });
                
                if (verifyResponse.ok) {
                  console.log('Successfully verified doctor in backend');
                } else {
                  console.log('Could not auto-verify doctor in backend');
                }
              }
            } else {
              console.log('Doctor not found in backend database');
              toast.error('Doctor account not found in our records');
              await signOut(auth);
              return;
            }
          } else {
            console.log('Email not verified in Firebase');
            toast.error('Please verify your email before logging in. Check your inbox for a verification link.');
            
            // Send a new verification email
            await sendEmailVerification(userCredential.user);
            
            await signOut(auth);
            return;
          }
        } catch (preVerifyError) {
          console.error('Error in pre-verification check:', preVerifyError);
          if (preVerifyError.code === 'auth/wrong-password') {
            toast.error('Invalid password. Please try again.');
            return;
          } else if (preVerifyError.code === 'auth/user-not-found') {
            toast.error('No account found with this email.');
            return;
          } else {
            toast.error(preVerifyError.message || 'Error authenticating. Please try again.');
            return;
          }
        }
        
        // Now attempt backend login
        try {
          // Check network connectivity first
          if (!navigator.onLine) {
            toast.error('You appear to be offline. Please check your internet connection and try again.');
            return;
          }
          
          const response = await fetch('http://localhost:5000/api/doctors/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              email: doctorLoginData.email,
              password: doctorLoginData.password,
              doctorId: doctorLoginData.doctorId
            })
          });

          console.log('Backend response status:', response.status);
          
          let data;
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            data = await response.json();
          } else {
            const text = await response.text();
            console.error('Received non-JSON response:', text);
            throw new Error('Server returned invalid response format');
          }
          
          console.log('Backend response data:', data);

          if (!response.ok) {
            if (response.status === 403) {
              toast.error('Please verify your email before logging in');
              await signOut(auth);
              return;
            }
            throw new Error(data.message || 'Invalid doctor credentials');
          }

          // We already authenticated with Firebase in the first step
          // So we don't need to call signInWithEmailAndPassword again
          console.log('Backend login successful');
          
          // Get the currently authenticated user
          const currentUser = auth.currentUser;
          if (!currentUser) {
            console.error('No authenticated user found after backend verification');
            toast.error('Authentication error. Please try again.');
            return;
          }

          // Set user info and proceed
          setUserType('doctor');
          setUser(currentUser);
          setIsAuthenticated(true);
          toast.success('Doctor logged in successfully!');
          setShowLogin(false);
          setIsDoctorLogin(false);
          navigate('/dashboard');
        } catch (error) {
          console.error('Error verifying doctor credentials:', error);
          toast.error(error.message || 'Error verifying doctor credentials. Please try again.');
          return;
        }
      } else {
        // Regular user login
        // Check network connectivity first
        if (!navigator.onLine) {
          toast.error('You appear to be offline. Please check your internet connection and try again.');
          return;
        }
        
        const userCredential = await signInWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );

        if (!userCredential.user.emailVerified) {
          toast.error('Please verify your email before logging in');
          return;
        }

        // Set user type to user
        setUserType('user');
        setUser(userCredential.user);
        setIsAuthenticated(true);
        toast.success('Logged in successfully!');
        setShowLogin(false);
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error.code === 'auth/network-request-failed') {
        toast.error('Network error: Please check your internet connection and try again.');
      } else {
        toast.error(error.message);
      }
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    console.log('Signup form submitted');
    setError('');

    // Validate passwords match
    if (isDoctorSignup) {
      console.log('Doctor signup data:', signupFormData);
      if (signupFormData.password !== signupFormData.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    } else {
      console.log('User signup data:', userSignupFormData);
      if (userSignupFormData.password !== userSignupFormData.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    try {
      if (isDoctorSignup) {
        console.log('Creating Firebase user for doctor');
        // First create Firebase user
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          signupFormData.email,
          signupFormData.password
        );
        console.log('Firebase user created:', userCredential.user.uid);
        
        // Store the user reference immediately
        const user = userCredential.user;
        console.log('User reference stored:', user.uid);

        // Send email verification first - THIS IS THE CRITICAL PART
        console.log('Sending verification email');
        try {
          // Make sure we use a complete action URL for email verification
          const actionCodeSettings = {
            // URL you want to redirect back to. Must be in your authorized domains list in Firebase Console.
            url: window.location.origin + '/?verifyEmail=true',
            // This must be true for email verification
            handleCodeInApp: true
          };
          
          await sendEmailVerification(user, actionCodeSettings);
          console.log('Verification email sent successfully with proper action URL');
        } catch (verificationError) {
          console.error('Error sending verification email:', verificationError);
          // If email verification fails, this is a critical error - show error and delete user
          try {
            await user.delete();
            console.log('Firebase user deleted after verification email failure');
          } catch (deleteError) {
            console.error('Error deleting Firebase user:', deleteError);
          }
          throw new Error('Failed to send verification email: ' + verificationError.message);
        }

        // Try to register with the backend, but treat it as non-critical
        let backendSuccess = false;
        let doctorId = null;
        console.log('Attempting to register doctor with backend');
        try {
          const response = await fetch('http://localhost:5000/api/doctors/register', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: signupFormData.name,
              email: signupFormData.email,
              password: signupFormData.password,
              specialization: signupFormData.specialization,
              expertise: signupFormData.expertise,
              experience: signupFormData.experience,
              education: signupFormData.education,
              patients: parseInt(signupFormData.patients),
              description: signupFormData.description,
              uid: user.uid,
              availableDates: [],
              availableSlots: []
            })
          });

          const data = await response.json();
          if (!response.ok) {
            console.error('Backend registration failed:', data);
            // Do not throw, continue with Firebase auth only
          } else {
            backendSuccess = true;
            doctorId = data.doctorId;
          }
        } catch (backendError) {
          console.error('Error registering with backend:', backendError);
          // Do not throw, continue with Firebase auth only
        }

        // Log out the user after registration
        await signOut(auth);

        // Show appropriate success message
        if (backendSuccess) {
          toast.success(`Doctor registration request submitted. Please check your email for verification. Your Doctor ID is: ${doctorId}`);
        } else {
          toast.success('Account created and verification email sent! Note: Your doctor profile could not be fully set up at this time. Please contact support after verifying your email.');
        }

        setShowSignup(false);
        setIsDoctorSignup(false);
        setSignupFormData({
          name: '',
          email: '',
          password: '',
          confirmPassword: '',
          specialization: '',
          expertise: '',
          experience: '',
          education: '',
          patients: '',
          description: '',
          availableDates: [],
          availableSlots: []
        });
      } else {
        // Regular user signup
        console.log('Creating Firebase user for regular user');
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          userSignupFormData.email,
          userSignupFormData.password
        );
        console.log('Firebase user created:', userCredential.user.uid);
        
        // Store the user reference immediately
        const user = userCredential.user;
        console.log('User reference stored:', user.uid);

        // Send email verification first - THIS IS THE CRITICAL PART
        console.log('Sending verification email');
        try {
          // Make sure we use a complete action URL for email verification
          const actionCodeSettings = {
            // URL you want to redirect back to. Must be in your authorized domains list in Firebase Console.
            url: window.location.origin + '/?verifyEmail=true',
            // This must be true for email verification
            handleCodeInApp: true
          };
          
          await sendEmailVerification(user, actionCodeSettings);
          console.log('Verification email sent successfully with proper action URL');
        } catch (verificationError) {
          console.error('Error sending verification email:', verificationError);
          // If email verification fails, this is a critical error - show error and delete user
          try {
            await user.delete();
            console.log('Firebase user deleted after verification email failure');
          } catch (deleteError) {
            console.error('Error deleting Firebase user:', deleteError);
          }
          throw new Error('Failed to send verification email: ' + verificationError.message);
        }

        // Try to store user data in Firestore, but don't fail registration if it doesn't work
        let firestoreSuccess = false;
        console.log('Attempting to store user data in Firestore');
        try {
          // Simplify the data structure
          const userData = {
            name: userSignupFormData.name,
            email: user.email,
            createdAt: new Date().toISOString(),
            userId: user.uid
          };
          
          console.log('Attempting to write user data with add()');
          const docRef = await addDoc(collection(db, 'users'), userData);
          console.log('User data stored successfully with ID:', docRef.id);
          firestoreSuccess = true;
        } catch (firestoreError) {
          console.error('Error storing user data in Firestore:', firestoreError);
          console.log('Continuing registration without Firestore storage');
          // We won't fail the registration process for Firestore errors
          // The critical part (user creation and email verification) is already done
        }

        // Log out the user after registration
        await signOut(auth);

        // Show appropriate success message
        if (firestoreSuccess) {
          toast.success('Account created successfully! Please check your email for verification.');
        } else {
          toast.success('Account created and verification email sent! Please note: Your profile data could not be stored at this time, but you can update it after verifying your email.');
        }
        
        setShowSignup(false);
        setUserSignupFormData({
          name: '',
          email: '',
          password: '',
          confirmPassword: ''
        });
      }
    } catch (error) {
      console.error('Error signing up:', error);
      if (error.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please use a different email or sign in.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (error.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters long.');
      } else {
        setError(error.message || 'An error occurred during registration.');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserType(null);
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Error logging out:', error);
      toast.error('Error logging out');
    }
  };

  // Add a function to resend verification email
  const handleResendVerificationEmail = async () => {
    if (!auth.currentUser) {
      toast.error('You must be logged in to request a verification email');
      setShowLogin(true);
      return;
    }

    try {
      const actionCodeSettings = {
        url: window.location.origin + '/?verifyEmail=true',
        handleCodeInApp: true
      };
      
      await sendEmailVerification(auth.currentUser, actionCodeSettings);
      toast.success('Verification email sent! Please check your inbox.');
    } catch (error) {
      console.error('Error sending verification email:', error);
      toast.error('Failed to send verification email. Please try again later.');
    }
  };

  return (
    <Routes>
      <Route path="/dashboard" element={
        isAuthenticated ? (
          userType === 'doctor' ? (
            <DoctorDashboard user={user} onLogout={handleLogout} />
          ) : (
            <Dashboard />
          )
        ) : (
          <Navigate to="/" />
        )
      } />
      <Route path="/" element={
        <div className="App">
          {!isOnline && (
            <div className="offline-indicator">
              You are currently offline. Some features may be unavailable.
            </div>
          )}
          {isAuthenticated ? (
            // Authenticated routes
            <>
              {userType === 'doctor' ? (
                <DoctorDashboard user={user} onLogout={handleLogout} />
              ) : (
                <Dashboard user={user} onLogout={handleLogout} />
              )}
            </>
          ) : (
            // Non-authenticated landing page
            <div className="landing-page">
              <nav className="navbar">
                <div className="logo">
                  <img src={logo} alt="BioNexa Logo" />
                  <h1>BioNexa</h1>
                </div>
                <div className="nav-buttons">
                  {user ? (
                    <>
                      <button className="btn btn-login" onClick={handleLogout}>Logout</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-login" onClick={() => setShowLogin(true)}>Login</button>
                      <button className="btn btn-signup" onClick={() => setShowSignup(true)}>Sign Up</button>
                    </>
                  )}
                </div>
              </nav>

              {!user && (
                <main className="hero">
                  <div className="hero-content">
                    <h1 className="hero-title">Welcome to BioNexa</h1>
                    <p className="hero-subtitle">Connecting Biology with Technology for a Better Future</p>
                    <button className="btn btn-signup" onClick={() => setShowSignup(true)}>Get Started</button>
                  </div>
                </main>
              )}

              {showLogin && (
                <div className="modal-overlay">
                  <div className="auth-modal">
                    <button className="close-btn" onClick={() => {
                      setShowLogin(false);
                      setIsDoctorLogin(false);
                      setFormData({ email: '', password: '', name: '' });
                      setDoctorLoginData({ email: '', doctorId: '', password: '' });
                    }}>&times;</button>
                    <h2>{isDoctorLogin ? 'Doctor Login' : 'User Login'}</h2>
                    <form onSubmit={handleLogin} className="auth-form">
                      {isDoctorLogin ? (
                        // Doctor login form
                        <>
                          <div className="form-group">
                            <label htmlFor="doctorEmail">Email</label>
                            <input
                              type="email"
                              id="doctorEmail"
                              value={doctorLoginData.email}
                              onChange={(e) => setDoctorLoginData({ ...doctorLoginData, email: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="doctorId">Doctor ID</label>
                            <input
                              type="text"
                              id="doctorId"
                              value={doctorLoginData.doctorId}
                              onChange={(e) => setDoctorLoginData({ ...doctorLoginData, doctorId: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="doctorPassword">Password</label>
                            <input
                              type="password"
                              id="doctorPassword"
                              value={doctorLoginData.password}
                              onChange={(e) => setDoctorLoginData({ ...doctorLoginData, password: e.target.value })}
                              required
                            />
                          </div>
                        </>
                      ) : (
                        // User login form
                        <>
                          <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input
                              type="email"
                              id="email"
                              name="email"
                              value={formData.email}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input
                              type="password"
                              id="password"
                              name="password"
                              value={formData.password}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                        </>
                      )}
                      <div className="flex justify-between items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setIsDoctorLogin(!isDoctorLogin);
                            setFormData({ email: '', password: '', name: '' });
                            setDoctorLoginData({ email: '', doctorId: '', password: '' });
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {isDoctorLogin ? 'Login as User' : 'Login as Doctor'}
                        </button>
                        <button type="submit" className="submit-button">
                          {isDoctorLogin ? 'Login as Doctor' : 'Login'}
                        </button>
                      </div>
                      {/* Add button to resend verification email */}
                      <div className="mt-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            // For doctor login, use the doctor email
                            const email = isDoctorLogin ? doctorLoginData.email : formData.email;
                            if (!email) {
                              toast.error('Please enter your email first');
                              return;
                            }
                            
                            // Sign in the user first (without showing errors)
                            signInWithEmailAndPassword(auth, email, isDoctorLogin ? doctorLoginData.password : formData.password)
                              .then(() => {
                                handleResendVerificationEmail();
                              })
                              .catch(error => {
                                if (error.code === 'auth/user-not-found') {
                                  toast.error('No account found with this email');
                                } else if (error.code === 'auth/wrong-password') {
                                  toast.error('Incorrect password. Please enter the correct password to verify your email.');
                                } else {
                                  console.error('Error signing in to resend verification:', error);
                                  toast.error('Please make sure your email and password are correct');
                                }
                              });
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                          Resend verification email
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {showSignup && (
                <div className="modal-overlay">
                  <div className="auth-modal">
                    <button className="close-btn" onClick={() => {
                      console.log('Closing signup modal');
                      setShowSignup(false);
                      setIsDoctorSignup(false);
                      setSignupFormData({
                        name: '',
                        email: '',
                        password: '',
                        confirmPassword: '',
                        specialization: '',
                        expertise: '',
                        experience: '',
                        education: '',
                        patients: '',
                        description: '',
                        availableDates: [],
                        availableSlots: []
                      });
                      setUserSignupFormData({
                        name: '',
                        email: '',
                        password: '',
                        confirmPassword: ''
                      });
                    }}>&times;</button>
                    <h2>{isDoctorSignup ? 'Doctor Registration' : 'User Registration'}</h2>
                    {error && (
                      <div className="error-message">
                        {error}
                      </div>
                    )}
                    <form onSubmit={handleSignupSubmit} className="auth-form">
                      {isDoctorSignup ? (
                        // Doctor signup form
                        <>
                          <div className="form-group">
                            <label htmlFor="name">Name</label>
                            <input
                              type="text"
                              id="name"
                              value={signupFormData.name}
                              onChange={(e) => setSignupFormData({ ...signupFormData, name: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input
                              type="email"
                              id="email"
                              value={signupFormData.email}
                              onChange={(e) => setSignupFormData({ ...signupFormData, email: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input
                              type="password"
                              id="password"
                              value={signupFormData.password}
                              onChange={(e) => setSignupFormData({ ...signupFormData, password: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <input
                              type="password"
                              id="confirmPassword"
                              value={signupFormData.confirmPassword}
                              onChange={(e) => setSignupFormData({ ...signupFormData, confirmPassword: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="specialization">Specialization</label>
                            <select
                              id="specialization"
                              value={signupFormData.specialization}
                              onChange={(e) => setSignupFormData({ ...signupFormData, specialization: e.target.value })}
                              required
                            >
                              <option value="">Select specialization</option>
                              <option value="Cardiology">Cardiology</option>
                              <option value="Dermatology">Dermatology</option>
                              <option value="Neurology">Neurology</option>
                              <option value="Pediatrics">Pediatrics</option>
                              <option value="Orthopedics">Orthopedics</option>
                              <option value="Ophthalmology">Ophthalmology</option>
                              <option value="ENT">ENT</option>
                              <option value="Dental">Dental</option>
                              <option value="Psychiatry">Psychiatry</option>
                              <option value="General">General</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label htmlFor="expertise">Expertise</label>
                            <input
                              type="text"
                              id="expertise"
                              value={signupFormData.expertise}
                              onChange={(e) => setSignupFormData({ ...signupFormData, expertise: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="experience">Years of Experience</label>
                            <input
                              type="number"
                              id="experience"
                              value={signupFormData.experience}
                              onChange={(e) => setSignupFormData({ ...signupFormData, experience: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="education">Education</label>
                            <input
                              type="text"
                              id="education"
                              value={signupFormData.education}
                              onChange={(e) => setSignupFormData({ ...signupFormData, education: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="patients">Number of Patients Treated</label>
                            <input
                              type="number"
                              id="patients"
                              value={signupFormData.patients}
                              onChange={(e) => setSignupFormData({ ...signupFormData, patients: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="description">Professional Description</label>
                            <textarea
                              id="description"
                              value={signupFormData.description}
                              onChange={(e) => setSignupFormData({ ...signupFormData, description: e.target.value })}
                              rows="3"
                              required
                            />
                          </div>
                        </>
                      ) : (
                        // User signup form
                        <>
                          <div className="form-group">
                            <label htmlFor="userName">Name</label>
                            <input
                              type="text"
                              id="userName"
                              value={userSignupFormData.name}
                              onChange={(e) => setUserSignupFormData({ ...userSignupFormData, name: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="userEmail">Email</label>
                            <input
                              type="email"
                              id="userEmail"
                              value={userSignupFormData.email}
                              onChange={(e) => setUserSignupFormData({ ...userSignupFormData, email: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="userPassword">Password</label>
                            <input
                              type="password"
                              id="userPassword"
                              value={userSignupFormData.password}
                              onChange={(e) => setUserSignupFormData({ ...userSignupFormData, password: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="userConfirmPassword">Confirm Password</label>
                            <input
                              type="password"
                              id="userConfirmPassword"
                              value={userSignupFormData.confirmPassword}
                              onChange={(e) => setUserSignupFormData({ ...userSignupFormData, confirmPassword: e.target.value })}
                              required
                            />
                          </div>
                        </>
                      )}
                      <div className="flex justify-between items-center">
                        <button
                          type="button"
                          onClick={() => {
                            console.log('Switching to:', isDoctorSignup ? 'User' : 'Doctor', 'registration');
                            setIsDoctorSignup(!isDoctorSignup);
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {isDoctorSignup ? 'Register as User' : 'Register as Doctor'}
                        </button>
                        <button
                          type="submit"
                          className="submit-button"
                        >
                          {isDoctorSignup ? 'Register Doctor' : 'Register User'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
          <ToastContainer position="top-right" autoClose={5000} />
        </div>
      }/>
    </Routes>
  );
}

export default App;
