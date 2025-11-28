"use client"

import React, { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase';
import { signOut, signInWithPhoneNumber, updatePassword, RecaptchaVerifier } from 'firebase/auth';
import './DoctorDashboard.css';
import { toast } from 'react-hot-toast';
import VideoCall from './VideoCall';

const buildTimeSlots = (sourceSlots = [], daysToShow = 7) => {
  const slots = [];
  const today = new Date();

  for (let i = 0; i < daysToShow; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    for (let hour = 9; hour <= 17; hour++) {
      const time = `${hour.toString().padStart(2, '0')}:00`;
      const existingSlot = sourceSlots.find((s) => s.date === dateStr && s.time === time) || {};

      slots.push({
        date: dateStr,
        time,
        isAvailable: existingSlot.isAvailable || false,
        isBooked: existingSlot.isBooked || false,
        patientLimit: existingSlot.patientLimit || 1,
        currentBookings: existingSlot.currentBookings || 0
      });
    }
  }

  return slots;
};

const DoctorDashboard = () => {
  const [doctor, setDoctor] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [availability, setAvailability] = useState([]);
  const [tempAvailability, setTempAvailability] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const settingsRef = useRef(null);
  const availabilityRef = useRef(null);
  const [stats, setStats] = useState({
    totalAppointments: 0,
    completedAppointments: 0,
    pendingAppointments: 0
  });
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [currentAppointment, setCurrentAppointment] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
      }
      if (availabilityRef.current && !availabilityRef.current.contains(event.target)) {
        setShowAvailability(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const currentUser = auth.currentUser;
        if (!currentUser) {
          console.error('No user logged in');
          setLoading(false);
          return;
        }

        const idToken = await currentUser.getIdToken(true);
        
        // Fetch doctor data first
        const doctorResponse = await fetch('http://localhost:5000/api/doctors/me', {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });

        if (!doctorResponse.ok) {
          const errorData = await doctorResponse.json();
          throw new Error(errorData.message || 'Failed to fetch doctor data');
        }

        const doctorData = await doctorResponse.json();
        if (!doctorData.success) {
          throw new Error(doctorData.message);
        }

        setDoctor(doctorData.data);

        // Fetch appointments
        const appointmentsResponse = await fetch('http://localhost:5000/api/appointments', {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });

        if (!appointmentsResponse.ok) {
          throw new Error('Failed to fetch appointments');
        }

        const appointmentsData = await appointmentsResponse.json();
        const appointmentsArray = appointmentsData.data || [];
        setAppointments(appointmentsArray);
        filterAppointments(appointmentsArray);

        // Calculate stats
        const stats = {
          totalAppointments: appointmentsArray.length,
          completedAppointments: appointmentsArray.filter(apt => apt.status === 'completed').length,
          pendingAppointments: appointmentsArray.filter(apt => apt.status === 'pending').length
        };
        setStats(stats);

        // Fetch availability
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];

        const availabilityResponse = await fetch(`http://localhost:5000/api/doctors/availability?startDate=${today}&endDate=${nextWeekStr}`, {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });

        if (!availabilityResponse.ok) {
          const errorData = await availabilityResponse.json();
          throw new Error(errorData.message || 'Failed to fetch availability');
        }

        const availabilityData = await availabilityResponse.json();
        
        let slots = [];
        if (availabilityData.success) {
          if (!availabilityData.data || availabilityData.data.length === 0) {
            slots = buildTimeSlots();
          } else {
            slots = availabilityData.data;
          }
        } else {
          slots = buildTimeSlots();
        }

        // Count current bookings for each slot
        const updatedSlots = slots.map(slot => {
          // Normalize the slot date and time
          const slotDate = slot.date;
          const slotTime = slot.time;

          // Count appointments for this slot
          const slotBookings = appointmentsArray.filter(apt => {
            // Normalize appointment date
            let aptDate;
            if (typeof apt.date === 'string') {
              aptDate = apt.date.split('T')[0];
            } else if (apt.date instanceof Date) {
              aptDate = apt.date.toISOString().split('T')[0];
            } else {
              // Handle case where apt.date is a timestamp or another format
              try {
                aptDate = new Date(apt.date).toISOString().split('T')[0];
              } catch (error) {
                console.error('Error parsing appointment date:', apt.date, error);
                return false;
              }
            }

            // Check if appointment matches this slot
            const dateMatches = aptDate === slotDate;
            const timeMatches = apt.time === slotTime;
            // Only count 'scheduled' and 'pending' appointments, not 'completed' or 'cancelled'
            const statusMatches = ['scheduled', 'pending'].includes(apt.status);

            if (dateMatches && timeMatches) {
              console.log(`Matching appointment found for slot ${slotDate} ${slotTime}: Status ${apt.status}, Counted: ${statusMatches}`);
            }

            return dateMatches && timeMatches && statusMatches;
          }).length;

          // Log for debugging
          if (slotBookings > 0) {
            console.log(`Slot ${slotDate} ${slotTime} has ${slotBookings} bookings`);
          }

          return {
            ...slot,
            currentBookings: slotBookings,
            isBooked: slotBookings >= (slot.patientLimit || 1)
          };
        });

        console.log('Updated slots with booking counts:', updatedSlots);
        setAvailability(updatedSlots);
        setTempAvailability(updatedSlots);
        setError(null);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Function to filter appointments into today and upcoming
  const filterAppointments = (appointmentsArray) => {
    if (!Array.isArray(appointmentsArray) || appointmentsArray.length === 0) {
      console.log("No appointments to filter");
      setTodayAppointments([]);
      setUpcomingAppointments([]);
      return;
    }
    
    console.log(`Starting to filter ${appointmentsArray.length} appointments`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's date string for comparison
    const todayDateString = today.toISOString().split('T')[0];
    console.log("Today's date string:", todayDateString);
    
    // Log all appointment dates to troubleshoot
    appointmentsArray.forEach(app => {
      console.log(`Appointment: ${app.id}, Date: ${app.date}, Status: ${app.status}, Patient: ${app.patientName}`);
    });
    
    // Helper function to get date in YYYY-MM-DD format
    const getDateString = (dateValue) => {
      if (!dateValue) return null;
      
      try {
        if (typeof dateValue === 'string') {
          // Handle ISO date strings, simple date strings, etc.
          return dateValue.split('T')[0];
        } else if (dateValue instanceof Date) {
          return dateValue.toISOString().split('T')[0];
        } else {
          // Try to convert other formats
          return new Date(dateValue).toISOString().split('T')[0];
        }
      } catch (error) {
        console.error("Error parsing date:", dateValue, error);
        return null;
      }
    };
    
    // Only consider non-cancelled appointments
    const activeAppointments = appointmentsArray.filter(apt => 
      apt.status !== 'cancelled'
    );
    
    console.log(`Active appointments (non-cancelled): ${activeAppointments.length}`);
    
    const todayAppts = activeAppointments.filter(appointment => {
      const appointmentDate = getDateString(appointment.date);
      if (!appointmentDate) return false;
      
      const isToday = appointmentDate === todayDateString;
      console.log(`Appointment: ${appointment.id}, date: ${appointmentDate}, isToday: ${isToday}`);
      return isToday;
    });
    
    const upcomingAppts = activeAppointments.filter(appointment => {
      const appointmentDate = getDateString(appointment.date);
      if (!appointmentDate) return false;
      
      const isUpcoming = appointmentDate > todayDateString;
      console.log(`Appointment: ${appointment.id}, date: ${appointmentDate}, isUpcoming: ${isUpcoming}`);
      return isUpcoming;
    });
    
    console.log(`Today's appointments: ${todayAppts.length}`);
    console.log(`Upcoming appointments: ${upcomingAppts.length}`);
    
    setTodayAppointments(todayAppts);
    setUpcomingAppointments(upcomingAppts);
  };

  const handleAvailabilityToggle = (date, time) => {
    try {
      const slot = tempAvailability.find(s => s.date === date && s.time === time);
      
      if (!slot) {
        console.log('Slot not found in tempAvailability, adding it now');
        // Create a new slot if it doesn't exist
        const newSlot = {
          date,
          time,
          isAvailable: true,
          isBooked: false,
          patientLimit: 1,
          currentBookings: 0
        };
        
        // Add the new slot to tempAvailability
        const newAvailability = [...tempAvailability, newSlot];
        setTempAvailability(newAvailability);
        return;
      }

      // Don't allow toggling if slot is booked
      if (slot.isBooked) {
        alert('Cannot modify availability for booked slots');
        return;
      }

      // Update temporary state
      const newAvailability = tempAvailability.map(s => 
        s.date === date && s.time === time 
          ? { ...s, isAvailable: !s.isAvailable }
          : s
      );
      setTempAvailability(newAvailability);
    } catch (error) {
      console.error('Error toggling availability:', error);
    }
  };

  const handleSaveAvailability = async () => {
    try {
      setIsSaving(true);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.error('No user logged in');
        return;
      }

      console.log('Current user:', currentUser.uid);
      
      // Ensure we preserve currentBookings values from the existing slots
      const updatedSlots = tempAvailability.map(tempSlot => {
        // Find the matching slot in the original availability array
        const originalSlot = availability.find(
          s => s.date === tempSlot.date && s.time === tempSlot.time
        );
        
        // If there's a matching slot, use its currentBookings value
        // Otherwise use the tempSlot's currentBookings or default to 0
        const currentBookings = originalSlot 
          ? originalSlot.currentBookings || 0 
          : tempSlot.currentBookings || 0;
          
        return {
          ...tempSlot,
          currentBookings
        };
      });
      
      console.log('Temp availability data with preserved bookings:', JSON.stringify(updatedSlots, null, 2));

      const idToken = await currentUser.getIdToken();
      console.log('Got auth token');

      // Update all slots in bulk
      const response = await fetch('http://localhost:5000/api/doctors/availability/bulk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ slots: updatedSlots })
      });

      console.log('Response status:', response.status);
      const responseText = await response.text();
      console.log('Response text:', responseText);

      if (!response.ok) {
        throw new Error(`Failed to update availability: ${responseText}`);
      }

      const data = JSON.parse(responseText);
      if (!data.success) {
        throw new Error(data.message);
      }

      // Update the main availability state with the preserved booking counts
      setAvailability(updatedSlots);
      setTempAvailability(updatedSlots);
      alert('Availability updated successfully!');
      setShowAvailability(false);
    } catch (error) {
      console.error('Error saving availability:', error);
      alert('Failed to save availability. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAppointmentStatus = async (appointmentId, newStatus) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.error('No user logged in');
        return;
      }

      const idToken = await currentUser.getIdToken();
      
      console.log(`Updating appointment ${appointmentId} to status: ${newStatus}`);
      
      // Update appointment status through API
      const response = await fetch(`http://localhost:5000/api/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      const responseData = await response.json();
      console.log('API response for status update:', responseData);

      if (!response.ok) {
        throw new Error('Failed to update appointment status');
      }

      // Update local state with the updated appointment from the API
      if (responseData.success && responseData.data) {
        // Replace the appointment in the array
        const updatedAppointments = appointments.map(apt =>
          apt.id === appointmentId ? responseData.data : apt
        );
        
        console.log('Updated appointments array:', updatedAppointments);
        setAppointments(updatedAppointments);
        
        // Re-filter appointments
        filterAppointments(updatedAppointments);

        // Update stats
        setStats({
          totalAppointments: updatedAppointments.length,
          completedAppointments: updatedAppointments.filter(apt => apt.status === 'completed').length,
          pendingAppointments: updatedAppointments.filter(apt => apt.status === 'pending' || apt.status === 'scheduled').length
        });

        // Update availability slots
        const appointment = responseData.data;
        const updatedAvailability = availability.map(slot => {
          if (slot.date === appointment.date && slot.time === appointment.time) {
            let currentBookings = slot.currentBookings || 0;
            
            // If appointment is being cancelled, decrease bookings
            if (newStatus === 'cancelled' && appointment.status !== 'cancelled') {
              currentBookings = Math.max(0, currentBookings - 1);
            }
            // If appointment is being completed/cancelled from pending/scheduled, decrease bookings
            else if ((newStatus === 'completed' || newStatus === 'cancelled') && 
                     (appointment.status === 'pending' || appointment.status === 'scheduled')) {
              currentBookings = Math.max(0, currentBookings - 1);
            }
            // If appointment is being scheduled from cancelled, increase bookings
            else if (newStatus === 'scheduled' && appointment.status === 'cancelled') {
              currentBookings += 1;
            }
            
            return {
              ...slot,
              currentBookings,
              isBooked: currentBookings >= (slot.patientLimit || 1)
            };
          }
          return slot;
        });

        setAvailability(updatedAvailability);
        setTempAvailability(updatedAvailability);

        // Save updated availability to the server
        const availabilityResponse = await fetch('http://localhost:5000/api/doctors/availability/bulk', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ slots: updatedAvailability })
        });

        if (!availabilityResponse.ok) {
          console.error('Failed to update availability after appointment status change');
        }
      }
    } catch (error) {
      console.error('Error updating appointment:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Redirect to login page or handle logout success
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleProfileSettingsClick = () => {
    setShowProfileSettings(true);
    setShowSettings(false);
  };

  const handleProfileUpdate = async (updatedData) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.error('No current user found');
        return;
      }

      console.log('Updating profile with data:', updatedData);
      const idToken = await currentUser.getIdToken(true);
      console.log('Got ID token, making request to update profile');
      
      const response = await fetch('http://localhost:5000/api/doctors/update-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(updatedData)
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Error response data:', errorData);
        throw new Error(`Failed to update profile: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Success response data:', data);
      console.log('Previous doctor state:', doctor);
      
      if (data.success) {
        // Update the doctor state with the data returned from the server
        // This ensures we have the most up-to-date information
        setDoctor(prevDoctor => {
          const newState = {
            ...prevDoctor,
            ...data.data
          };
          console.log('Updated doctor state:', newState);
          return newState;
        });
        toast.success('Profile updated successfully');
        setShowProfileSettings(false);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(`Failed to update profile: ${error.message}`);
    }
  };

  const handlePatientLimitChange = (date, time, newLimit) => {
    try {
      // Validate that the limit is a positive number
      const limit = parseInt(newLimit);
      if (isNaN(limit) || limit <= 0) {
        toast.error('Patient limit must be a positive number');
        return;
      }
      
      // Set a maximum limit of 10 patients per slot
      if (limit > 10) {
        toast.error('Maximum patient limit is 10 per slot');
        return;
      }
      
      const newAvailability = tempAvailability.map(s => 
        s.date === date && s.time === time 
          ? { ...s, patientLimit: limit }
          : s
      );
      setTempAvailability(newAvailability);
      toast.success(`Patient limit set to ${limit} for ${time} on ${date}`);
    } catch (error) {
      console.error('Error updating patient limit:', error);
      toast.error('Failed to update patient limit');
    }
  };

  const getNearCapacitySlots = () => {
    if (!availability) return [];
    
    return Object.entries(availability)
      .filter(([_, slot]) => {
        const currentBookings = slot.currentBookings || 0;
        const patientLimit = slot.patientLimit || 1;
        return currentBookings > 0 && (currentBookings >= patientLimit || currentBookings >= patientLimit * 0.8);
      })
      .map(([date, slot]) => ({
        date,
        time: slot.time,
        currentBookings: slot.currentBookings || 0,
        patientLimit: slot.patientLimit || 1
      }))
      .sort((a, b) => b.currentBookings - a.currentBookings);
  };

  const isWithinThirtyMinutes = (appointmentDate, appointmentTime) => {
    // For testing purposes, always return true
    return true;
    
    // Original code (commented out for testing)
    // const now = new Date();
    // const appointmentDateTime = new Date(appointmentDate);
    // const [hours, minutes] = appointmentTime.split(':');
    // appointmentDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // const diffInMinutes = (appointmentDateTime - now) / (1000 * 60);
    // return diffInMinutes >= 0 && diffInMinutes <= 30;
  };

  const handleJoinVideoCall = (appointment) => {
    setCurrentAppointment(appointment);
    setShowVideoCall(true);
  };
  
  const handleCloseVideoCall = () => {
    setShowVideoCall(false);
    setCurrentAppointment(null);
  };

  // Define ProfileSettingsModal inside the DoctorDashboard component
  const ProfileSettingsModal = () => {
    const [name, setName] = useState(doctor?.name || '');
    const [mobileNumber, setMobileNumber] = useState(doctor?.contact?.phone || '');
    const [profilePhoto, setProfilePhoto] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(doctor?.profilePhotoUrl ? `http://localhost:5000${doctor.profilePhotoUrl}` : '');
    const [isPhoneVerified, setIsPhoneVerified] = useState(doctor?.contact?.phoneVerified || false);
    const [verificationId, setVerificationId] = useState('');
    const [otp, setOtp] = useState('');
    const [showOtpInput, setShowOtpInput] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [showPasswordSection, setShowPasswordSection] = useState(false);

    // Update form state when doctor data changes
    useEffect(() => {
      console.log('Doctor data changed in modal:', doctor);
      setName(doctor?.name || '');
      setMobileNumber(doctor?.contact?.phone || '');
      setPreviewUrl(doctor?.profilePhotoUrl ? `http://localhost:5000${doctor.profilePhotoUrl}` : '');
      setIsPhoneVerified(doctor?.contact?.phoneVerified || false);
    }, [doctor]);

    const handlePhotoChange = (e) => {
      const file = e.target.files[0];
      if (file) {
        setProfilePhoto(file);
        setPreviewUrl(URL.createObjectURL(file));
      }
    };

    const setupRecaptcha = () => {
      try {
        // Clear any existing reCAPTCHA
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
        }

        // Create a new reCAPTCHA verifier
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => {
            // reCAPTCHA solved, allow signInWithPhoneNumber
            console.log('reCAPTCHA verified');
          },
          'expired-callback': () => {
            // Reset reCAPTCHA when expired
            console.log('reCAPTCHA expired');
            window.recaptchaVerifier.clear();
            toast.error('Verification expired. Please try again.');
          }
        });

        // Render the reCAPTCHA widget
        window.recaptchaVerifier.render().then(function(widgetId) {
          window.recaptchaWidgetId = widgetId;
        });
      } catch (error) {
        console.error('Error setting up reCAPTCHA:', error);
        toast.error('Failed to initialize verification. Please try again.');
      }
    };

    const handleSendOtp = async () => {
      try {
        if (!mobileNumber) {
          toast.error('Please enter a phone number first');
          return;
        }

        // Format phone number to E.164 format
        let formattedNumber = mobileNumber.replace(/\D/g, ''); // Remove non-digits
        
        // Ensure the number starts with +91 and is exactly 12 digits (excluding +)
        if (formattedNumber.startsWith('91')) {
          formattedNumber = '+' + formattedNumber;
        } else if (formattedNumber.startsWith('0')) {
          formattedNumber = '+91' + formattedNumber.substring(1);
        } else {
          formattedNumber = '+91' + formattedNumber;
        }

        // Validate phone number format (should be +91 followed by 10 digits)
        if (!/^\+91\d{10}$/.test(formattedNumber)) {
          toast.error('Please enter a valid 10-digit Indian phone number');
          return;
        }

        // Setup reCAPTCHA first
        setupRecaptcha();
        
        // Wait for reCAPTCHA to be ready
        if (!window.recaptchaVerifier) {
          throw new Error('reCAPTCHA not initialized');
        }

        const appVerifier = window.recaptchaVerifier;
        const confirmationResult = await signInWithPhoneNumber(auth, formattedNumber, appVerifier);
        setVerificationId(confirmationResult);
        setShowOtpInput(true);
        toast.success('OTP sent successfully!');
      } catch (error) {
        console.error('Error sending OTP:', error);
        if (error.code === 'auth/invalid-phone-number') {
          toast.error('Please enter a valid 10-digit Indian phone number');
        } else {
          toast.error(error.message || 'Failed to send OTP');
        }
      }
    };

    const handleVerifyOtp = async () => {
      try {
        const result = await verificationId.confirm(otp);
        if (result.user) {
          setIsPhoneVerified(true);
          setShowOtpInput(false);
          toast.success('Phone number verified successfully!');
          
          // Update backend with verified status
          const idToken = await auth.currentUser.getIdToken(true);
          await fetch('http://localhost:5000/api/doctors/update-profile', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              name,
              mobileNumber,
              profilePhotoUrl: doctor?.profilePhotoUrl || '',
              contact: {
                phone: mobileNumber,
                phoneVerified: true
              }
            })
          });
        }
      } catch (error) {
        console.error('Error verifying OTP:', error);
        toast.error('Invalid OTP. Please try again.');
      }
    };

    const handlePasswordChange = async (e) => {
      e.preventDefault();
      if (!isPhoneVerified) {
        toast.error('Please verify your phone number first');
        return;
      }

      if (newPassword !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }

      if (newPassword.length < 6) {
        toast.error('Password should be at least 6 characters long');
        return;
      }

      setIsChangingPassword(true);
      try {
        await updatePassword(auth.currentUser, newPassword);
        toast.success('Password updated successfully!');
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordSection(false);
      } catch (error) {
        console.error('Error changing password:', error);
        toast.error(error.message || 'Failed to change password');
      } finally {
        setIsChangingPassword(false);
      }
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      try {
        let profilePhotoUrl = doctor?.profilePhotoUrl || '';

        if (profilePhoto) {
          // Create a FormData object to send the file
          const formData = new FormData();
          formData.append('photo', profilePhoto);

          // Upload the photo first
          const uploadResponse = await fetch('http://localhost:5000/api/doctors/upload-photo', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
            },
            body: formData
          });

          if (!uploadResponse.ok) {
            throw new Error('Failed to upload photo');
          }

          const uploadData = await uploadResponse.json();
          console.log('Photo upload response:', uploadData);
          profilePhotoUrl = uploadData.photoUrl;
        }

        // Update profile with all data including photo URL
        const updatedData = {
          name,
          mobileNumber,
          profilePhotoUrl,
          contact: {
            phone: mobileNumber,
            phoneVerified: isPhoneVerified
          }
        };
        console.log('Submitting profile update with data:', updatedData);

        await handleProfileUpdate(updatedData);
      } catch (error) {
        console.error('Error in profile update:', error);
        toast.error('Failed to update profile: ' + error.message);
      }
    };

    return (
      <div className="profile-settings-modal">
        <div className="profile-settings-content">
          <div className="profile-settings-header">
            <h2>Profile Settings</h2>
            <button className="close-button" onClick={() => setShowProfileSettings(false)}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="profile-settings-form">
            <div className="profile-photo-section">
              <div className="profile-photo-container">
                {previewUrl ? (
                  <img 
                    src={previewUrl} 
                    alt="Profile" 
                    className="profile-photo-preview" 
                    onError={(e) => {
                      console.error('Error loading profile photo:', e);
                      e.target.onerror = null;
                      e.target.src = '';
                      e.target.parentElement.innerHTML = '<div class="profile-photo-placeholder"><i class="fas fa-user"></i></div>';
                    }}
                  />
                ) : (
                  <div className="profile-photo-placeholder">
                    <i className="fas fa-user"></i>
                  </div>
                )}
              </div>
              <div className="profile-photo-upload">
                <label htmlFor="profile-photo" className="upload-button">
                  <i className="fas fa-camera"></i>
                  Change Photo
                </label>
                <input
                  id="profile-photo"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>
            <div className="form-group">
              <label htmlFor="mobile">Mobile Number</label>
              <div className="phone-input-group">
                <input
                  type="tel"
                  id="mobile"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="Enter your mobile number"
                  disabled={isPhoneVerified}
                />
                {!isPhoneVerified && (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="verify-button"
                  >
                    Verify Phone
                  </button>
                )}
                {isPhoneVerified && (
                  <span className="verified-badge">
                    <i className="fas fa-check"></i> Verified
                  </span>
                )}
              </div>
              <div id="recaptcha-container" style={{ marginTop: '10px' }}></div>
            </div>

            {showOtpInput && (
              <div className="form-group">
                <label htmlFor="otp">Enter OTP</label>
                <div className="otp-input-group">
                  <input
                    type="text"
                    id="otp"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter OTP"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    className="verify-button"
                  >
                    Verify OTP
                  </button>
                </div>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="save-button">
                Save Changes
              </button>
              <button type="button" className="cancel-button" onClick={() => setShowProfileSettings(false)}>
                Cancel
              </button>
            </div>
          </form>

          <div className="password-change-section">
            <h3><i className="fas fa-lock"></i> Change Password</h3>
            {!showPasswordSection ? (
              <button 
                type="button" 
                className="change-password-button"
                onClick={() => setShowPasswordSection(true)}
                disabled={!isPhoneVerified}
              >
                Change Password
              </button>
            ) : (
              <form onSubmit={handlePasswordChange} className="password-form">
                <div className="form-group">
                  <label htmlFor="newPassword">New Password</label>
                  <input
                    type="password"
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    disabled={!isPhoneVerified}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    disabled={!isPhoneVerified}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="save-button"
                    disabled={!isPhoneVerified || isChangingPassword}
                  >
                    {isChangingPassword ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : (
                      'Change Password'
                    )}
                  </button>
                  <button 
                    type="button" 
                    className="cancel-button"
                    onClick={() => setShowPasswordSection(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {!isPhoneVerified && (
              <p className="verification-notice">
                Please verify your phone number to change password
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  // Debug info for appointments
  console.log("Current appointments data:", appointments);
  console.log("Today's appointments:", todayAppointments);
  console.log("Upcoming appointments:", upcomingAppointments);

  return (
    <div className="doctor-dashboard">
      <div className="dashboard-header">
        <div className="doctor-info">
          <div className="doctor-photo">
            {doctor?.profilePhotoUrl ? (
              <img 
                src={`http://localhost:5000${doctor.profilePhotoUrl}`} 
                alt="Doctor's profile" 
                className="profile-photo" 
                onError={(e) => {
                  console.error('Error loading profile photo:', e);
                  e.target.onerror = null;
                  e.target.src = '';
                  e.target.parentElement.innerHTML = '<div class="profile-photo-placeholder"><i class="fas fa-user"></i></div>';
                }}
              />
            ) : (
              <div className="profile-photo-placeholder">
                <i className="fas fa-user"></i>
              </div>
            )}
          </div>
          <div className="doctor-details">
            <h1>{doctor?.name || 'Doctor Name'}</h1>
            <p>{doctor?.specialization || 'Specialization'}</p>
          </div>
        </div>
        <div className="quick-actions">
          <h2>Quick Actions</h2>
          <div className="action-buttons">
            <button className="action-button" onClick={() => setShowAvailability(true)}>
              <i className="fas fa-calendar-alt"></i>
              Set Availability
            </button>
            <button className="action-button">
              <i className="fas fa-calendar-plus"></i>
              New Appointment
            </button>
            <button className="action-button">
              <i className="fas fa-user-plus"></i>
              Add Patient
            </button>
            <button className="action-button">
              <i className="fas fa-file-medical"></i>
              Write Prescription
            </button>
          </div>
        </div>
        <div className="settings-container" ref={settingsRef}>
          <div className="settings-icon" onClick={() => setShowSettings(!showSettings)}>
            <i className="fas fa-cog"></i>
          </div>
          <div className={`settings-dropdown ${showSettings ? 'active' : ''}`}>
            <div className="settings-dropdown-item" onClick={handleProfileSettingsClick}>
              <i className="fas fa-user"></i>
              Profile Settings
            </div>
            <div className="settings-dropdown-item">
              <i className="fas fa-bell"></i>
              Notification Settings
            </div>
            <div className="settings-dropdown-item">
              <i className="fas fa-shield-alt"></i>
              Security
            </div>
            <div className="settings-dropdown-item logout" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt"></i>
              Logout
            </div>
          </div>
        </div>
      </div>

      {/* Availability Modal */}
      {showAvailability && (
        <div className="availability-modal" ref={availabilityRef}>
          <div className="availability-content">
            <div className="availability-header">
              <h2>Set Your Availability</h2>
              <div className="availability-actions">
                <button 
                  className="select-all-btn" 
                  onClick={() => {
                    // If tempAvailability is empty, use generated slots
                    const slots = tempAvailability.length === 0 ? buildTimeSlots(availability) : tempAvailability;
                    const updatedSlots = slots.map(slot => ({ ...slot, isAvailable: true }));
                    setTempAvailability(updatedSlots);
                  }}
                >
                  Select All
                </button>
                <button 
                  className="deselect-all-btn" 
                  onClick={() => {
                    // If tempAvailability is empty, use generated slots
                    const slots = tempAvailability.length === 0 ? buildTimeSlots(availability) : tempAvailability;
                    const updatedSlots = slots.map(slot => ({ ...slot, isAvailable: false }));
                    setTempAvailability(updatedSlots);
                  }}
                >
                  Deselect All
                </button>
                <button 
                  className="save-button" 
                  onClick={handleSaveAvailability}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button 
                  className="close-button" 
                  onClick={() => {
                    setTempAvailability(availability);
                    setShowAvailability(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
            
            <div className="availability-calendar">
              {(() => {
                // Make sure we always have slots to display
                const ensureSlots = () => {
                  if (!tempAvailability || tempAvailability.length === 0) {
                    console.log('Using generated time slots for display');
                    return buildTimeSlots(availability);
                  }
                  return tempAvailability;
                };
                
                const slots = ensureSlots();
                
                // Group slots by date
                const groupedSlots = slots.reduce((acc, slot) => {
                  if (!acc[slot.date]) {
                    acc[slot.date] = [];
                  }
                  acc[slot.date].push(slot);
                  return acc;
                }, {});

                return Object.entries(groupedSlots).map(([date, slots]) => (
                  <div key={date} className="date-section">
                    <div className="date-header">
                      <h3>{new Date(date).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        month: 'long', 
                        day: 'numeric' 
                      })}</h3>
                      <div className="date-actions">
                        <button 
                          className="select-date-btn"
                          onClick={() => {
                            const updatedSlots = tempAvailability.map(s => 
                              s.date === date ? { ...s, isAvailable: true } : s
                            );
                            
                            // Find all slots for this date from our display slots
                            const displaySlots = ensureSlots();
                            const dateSlots = displaySlots.filter(s => s.date === date);
                            
                            // For each slot in the display, make sure it exists in our updated slots
                            dateSlots.forEach(displaySlot => {
                              const exists = updatedSlots.some(s => 
                                s.date === displaySlot.date && s.time === displaySlot.time
                              );
                              
                              if (!exists) {
                                // Add the slot with isAvailable set to true
                                updatedSlots.push({
                                  ...displaySlot,
                                  isAvailable: true
                                });
                              }
                            });
                            
                            setTempAvailability(updatedSlots);
                          }}
                        >
                          Select All
                        </button>
                        <button 
                          className="deselect-date-btn"
                          onClick={() => {
                            const updatedSlots = tempAvailability.map(s => 
                              s.date === date ? { ...s, isAvailable: false } : s
                            );
                            
                            // Find all slots for this date from our display slots
                            const displaySlots = ensureSlots();
                            const dateSlots = displaySlots.filter(s => s.date === date);
                            
                            // For each slot in the display, make sure it exists in our updated slots
                            dateSlots.forEach(displaySlot => {
                              const exists = updatedSlots.some(s => 
                                s.date === displaySlot.date && s.time === displaySlot.time
                              );
                              
                              if (!exists) {
                                // Add the slot with isAvailable set to false
                                updatedSlots.push({
                                  ...displaySlot,
                                  isAvailable: false
                                });
                              }
                            });
                            
                            setTempAvailability(updatedSlots);
                          }}
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>
                    <div className="time-slots-grid">
                      {slots.map((slot) => (
                        <div
                          key={`${slot.date}-${slot.time}`}
                          className={`time-slot ${slot.isAvailable ? 'available' : ''} ${slot.isBooked ? 'booked' : ''}`}
                          onClick={() => !slot.isBooked && handleAvailabilityToggle(slot.date, slot.time)}
                          title={slot.isBooked ? 'This slot is already booked' : ''}
                        >
                          <div className="time">{slot.time}</div>
                          <div className="status-indicator">
                            {slot.isBooked ? 'Booked' : (slot.isAvailable ? 'Available' : 'Unavailable')}
                          </div>
                          {slot.isAvailable && (
                            <div className="patient-limit-control" onClick={(e) => e.stopPropagation()}>
                              <label htmlFor={`patient-limit-${slot.date}-${slot.time}`}>Patients per slot:</label>
                              <select 
                                id={`patient-limit-${slot.date}-${slot.time}`}
                                value={slot.patientLimit || 1}
                                onChange={(e) => handlePatientLimitChange(slot.date, slot.time, e.target.value)}
                                className="patient-limit-select"
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                                  <option key={num} value={num}>{num}</option>
                                ))}
                              </select>
                              <div className="booking-info">
                                {slot.currentBookings || 0}/{slot.patientLimit || 1} booked
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-stats">
        <div className="stat-card">
          <h3>Total Appointments</h3>
          <div className="value">{stats.totalAppointments}</div>
        </div>
        <div className="stat-card">
          <h3>Completed</h3>
          <div className="value">{stats.completedAppointments}</div>
        </div>
        <div className="stat-card">
          <h3>Pending</h3>
          <div className="value">{stats.pendingAppointments}</div>
        </div>
      </div>

      <div className="dashboard-section">
        <h3>Near Capacity Slots</h3>
        {getNearCapacitySlots().length > 0 ? (
          <div className="near-capacity-slots">
            {getNearCapacitySlots().map((slot, index) => (
              <div key={index} className={`slot-card ${slot.currentBookings >= slot.patientLimit ? 'fully-booked' : 'nearly-full'}`}>
                <div className="slot-date">{new Date(slot.date).toLocaleDateString()}</div>
                <div className="slot-time">{slot.time}</div>
                <div className="slot-bookings">
                  {slot.currentBookings}/{slot.patientLimit} patients
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-data">No slots near capacity</p>
        )}
      </div>

      <div className="dashboard-content">
        <div className="appointments-section">
          <div className="section-header">
            <h2>Today's Appointments</h2>
          </div>
          <div className="appointments-list">
            {!Array.isArray(todayAppointments) || todayAppointments.length === 0 ? (
              <p>No appointments scheduled for today</p>
            ) : (
              todayAppointments.map(appointment => {
                console.log('Rendering appointment:', appointment);
                return (
                  <div key={appointment.id} className="appointment-card">
                    <div className="appointment-info">
                      <h4>{appointment.patientName}</h4>
                      <div className={`appointment-status ${appointment.status}`}>
                        {appointment.status}
                      </div>
                      <p><strong>Time:</strong> {appointment.time}</p>
                      {appointment.patientEmail && (
                        <p className="patient-detail">
                          <i className="fas fa-envelope"></i> {appointment.patientEmail}
                        </p>
                      )}
                      {appointment.patientPhone && (
                        <p className="patient-detail">
                          <i className="fas fa-phone"></i> {appointment.patientPhone}
                        </p>
                      )}
                      {appointment.appointmentReason && (
                        <p className="patient-detail">
                          <i className="fas fa-sticky-note"></i> {appointment.appointmentReason}
                        </p>
                      )}
                    </div>
                    <div className="appointment-actions">
                      {appointment.status === 'scheduled' && (
                        <>
                          <button
                            className="btn btn-primary"
                            onClick={() => handleAppointmentStatus(appointment.id, 'completed')}
                          >
                            Complete
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleAppointmentStatus(appointment.id, 'cancelled')}
                          >
                            Cancel
                          </button>
                          {isWithinThirtyMinutes(appointment.date, appointment.time) && (
                            <button
                              className="btn btn-video"
                              onClick={() => handleJoinVideoCall(appointment)}
                            >
                              <i className="fas fa-video"></i>
                              Join Video Call
                            </button>
                          )}
                        </>
                      )}
                      {appointment.status === 'completed' && (
                        <div className="completed-text">✓ Completed</div>
                      )}
                      {appointment.status === 'cancelled' && (
                        <div className="cancelled-text">✗ Cancelled</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          <div className="section-header upcoming-header">
            <h2>Upcoming Appointments</h2>
          </div>
          <div className="appointments-list">
            {!Array.isArray(upcomingAppointments) || upcomingAppointments.length === 0 ? (
              <p>No upcoming appointments scheduled</p>
            ) : (
              upcomingAppointments.map(appointment => (
                <div key={appointment.id} className="appointment-card">
                  <div className="appointment-info">
                    <h4>{appointment.patientName}</h4>
                    <div className={`appointment-status ${appointment.status}`}>
                      {appointment.status}
                    </div>
                    <p><strong>Date:</strong> {new Date(appointment.date).toLocaleDateString()} at {appointment.time}</p>
                    {appointment.patientEmail && (
                      <p className="patient-detail">
                        <i className="fas fa-envelope"></i> {appointment.patientEmail}
                      </p>
                    )}
                    {appointment.patientPhone && (
                      <p className="patient-detail">
                        <i className="fas fa-phone"></i> {appointment.patientPhone}
                      </p>
                    )}
                    {appointment.appointmentReason && (
                      <p className="patient-detail">
                        <i className="fas fa-sticky-note"></i> {appointment.appointmentReason}
                      </p>
                    )}
                  </div>
                  <div className="appointment-actions">
                    {appointment.status === 'scheduled' && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleAppointmentStatus(appointment.id, 'cancelled')}
                      >
                        Cancel
                      </button>
                    )}
                    {appointment.status === 'completed' && (
                      <div className="completed-text">✓ Completed</div>
                    )}
                    {appointment.status === 'cancelled' && (
                      <div className="cancelled-text">✗ Cancelled</div>
                    )}
                    {isWithinThirtyMinutes(appointment.date, appointment.time) && appointment.status === 'scheduled' && (
                      <button
                        className="btn btn-video"
                        onClick={() => handleJoinVideoCall(appointment)}
                      >
                        <i className="fas fa-video"></i>
                        Join Video Call
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="notifications">
            <h2>Notifications</h2>
            <div className="notification-item">
              <div className="notification-icon">
                <i className="fas fa-bell"></i>
              </div>
              <div className="notification-content">
                <h4>New Appointment Request</h4>
                <p>John Doe requested an appointment for tomorrow</p>
              </div>
            </div>
            <div className="notification-item">
              <div className="notification-icon">
                <i className="fas fa-exclamation-circle"></i>
              </div>
              <div className="notification-content">
                <h4>System Update</h4>
                <p>New features available in your dashboard</p>
              </div>
            </div>
            <div className="notification-item">
              <div className="notification-icon">
                <i className="fas fa-calendar-check"></i>
              </div>
              <div className="notification-content">
                <h4>Appointment Reminder</h4>
                <p>You have 3 appointments scheduled for today</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showProfileSettings && <ProfileSettingsModal />}
      {showVideoCall && currentAppointment && (
        <VideoCall
          appointment={currentAppointment}
          onClose={handleCloseVideoCall}
          role="doctor"
        />
      )}
    </div>
  );
};

export default DoctorDashboard;

