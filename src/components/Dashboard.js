import React, { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faComments, faUserMd, faUser, faCalendarAlt, faPrescription, faSignOutAlt, faPlus, faSearch, faStethoscope, faNotesMedical, faSpinner, faArrowLeft, faExclamationTriangle, faStar, faGraduationCap, faBriefcase, faUsers, faTimesCircle, faCalendarDay, faClock as faClockSolid, faVideo } from '@fortawesome/free-solid-svg-icons';
import { motion } from 'framer-motion';
import { signOut } from 'firebase/auth';
import { analyzeSymptoms } from '../services/aiService';
import './Dashboard.css';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import VideoCall from './VideoCall';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [appointmentSubTab, setAppointmentSubTab] = useState('upcoming');
  const [isBooking, setIsBooking] = useState(false);
  const [searchType, setSearchType] = useState(null);
  const [selectedSpecialization, setSelectedSpecialization] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [appointments, setAppointments] = useState({
    upcoming: [],
    previous: []
  });
  const [error, setError] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [currentAppointment, setCurrentAppointment] = useState(null);
  const [activeDoctorId, setActiveDoctorId] = useState(null);

  const specializations = [
    'Cardiology',
    'Dermatology',
    'Endocrinology',
    'ENT',
    'Gastroenterology',
    'Neurology',
    'Oncology',
    'Pediatrics',
    'Psychiatry',
    'Pulmonology',
    'Urology'
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        if (!user.emailVerified) {
          toast.error('Please verify your email before logging in');
          await signOut(auth);
          setUser(null);
          setUserType(null);
          return;
        }
        
        // Check if user is admin by checking their email
        const isAdmin = user.email === 'admin@bionexa.com'; // Replace with your admin email
        setUserType(isAdmin ? 'admin' : 'user');
        setUser(user);
      } else {
        setUser(null);
        setUserType(null);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchAppointments = async () => {
      if (!user) return;

      try {
        const response = await fetch('http://localhost:5000/api/appointments', {
          headers: {
            'Authorization': `Bearer ${await user.getIdToken()}`
          }
        });

        const data = await response.json();
        
        if (response.ok) {
          // Sort appointments based on date and status
          const now = new Date();
          now.setHours(0, 0, 0, 0); // Set to start of current day
          const allAppointments = data.data.upcoming.concat(data.data.previous);
          
          const sortedAppointments = {
            upcoming: allAppointments.filter(app => {
              const appointmentDate = new Date(app.date);
              appointmentDate.setHours(0, 0, 0, 0); // Set to start of appointment day
              
              // Include appointments that:
              // 1. Are scheduled for future dates AND
              // 2. Have status 'scheduled' or 'pending' AND
              // 3. Are not cancelled or completed
              return appointmentDate >= now && 
                     (app.status === 'scheduled' || app.status === 'pending') &&
                     app.status !== 'cancelled' &&
                     app.status !== 'completed';
            }).sort((a, b) => new Date(a.date) - new Date(b.date)),
            
            previous: allAppointments.filter(app => {
              const appointmentDate = new Date(app.date);
              appointmentDate.setHours(0, 0, 0, 0); // Set to start of appointment day
              
              // Include appointments that:
              // 1. Are in the past OR
              // 2. Have status 'cancelled' or 'completed'
              return appointmentDate < now || 
                     app.status === 'cancelled' || 
                     app.status === 'completed';
            }).sort((a, b) => new Date(b.date) - new Date(a.date))
          };

          setAppointments(sortedAppointments);
        } else {
          console.error('Error fetching appointments:', data.message);
        }
      } catch (error) {
        console.error('Error fetching appointments:', error);
      }
    };

    fetchAppointments();
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleBookAppointment = () => {
    setIsBooking(true);
  };

  const handleBackToAppointments = () => {
    setIsBooking(false);
    setSearchType(null);
    setSelectedSpecialization('');
    setSymptoms('');
    setAnalysisResult(null);
  };

  const handleBackToSearchOptions = () => {
    setSearchType(null);
    setSelectedSpecialization('');
    setSymptoms('');
    setAnalysisResult(null);
  };

  const handleSpecializationSearch = async () => {
    if (!selectedSpecialization) return;
    setIsLoadingDoctors(true);
    try {
      // Create URL with the selected specialization
      const url = new URL(`http://localhost:5000/api/doctors/specialization/${selectedSpecialization}`);
      
      // Add date filter if selected
      if (selectedDate) {
        url.searchParams.append('date', selectedDate);
      }
      
      console.log('Fetching doctors from:', url.toString());
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${await user.getIdToken()}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch doctors');
      }
      
      const data = await response.json();
      console.log('Received doctors data:', data.data);
      
      // Add logging to check availability data
      if (data.data && data.data.length > 0) {
        data.data.forEach(doctor => {
          console.log(`Doctor ${doctor.name} availability:`, 
            doctor.availability?.filter(slot => 
              slot.isAvailable && !slot.isBooked && slot.currentBookings < (slot.patientLimit || 1)
            )
          );
        });
      }
      
      setAvailableDoctors(data.data);
      setSearchType('doctors-list');
    } catch (error) {
      console.error('Error fetching doctors:', error);
      toast.error('Failed to fetch doctors. Please try again.');
    } finally {
      setIsLoadingDoctors(false);
    }
  };

  const handleDateSelect = (date, doctorId) => {
    setSelectedDate(date);
    setActiveDoctorId(doctorId);
    
    // Find the doctor with this ID to get their available slots
    const doctor = availableDoctors.find(d => d._id === doctorId || d.id === doctorId);
    if (doctor) {
      console.log(`Doctor ${doctor.name} availability:`, doctor.availability);
      // Check for slots on the selected date
      const slotsForDate = doctor.availability ? doctor.availability.filter(slot => slot.date === date) : [];
      console.log(`Available slots for ${date}:`, slotsForDate);
    }
  };

  const handleSlotSelect = (slot, doctorId) => {
    setSelectedSlot(slot);
    setActiveDoctorId(doctorId);
    
    // Find the doctor with this ID to check this specific slot
    const doctor = availableDoctors.find(d => d._id === doctorId || d.id === doctorId);
    if (doctor && doctor.availability) {
      const matchingSlot = doctor.availability.find(s => s.date === selectedDate && s.time === slot);
      console.log(`Selected slot ${slot} on ${selectedDate} exists:`, !!matchingSlot);
      if (matchingSlot) {
        console.log(`Slot details:`, matchingSlot);
      } else {
        console.log(`Slot does not exist in doctor's availability`);
      }
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/appointments/${appointmentId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to cancel appointment');
      }

      // Update the appointments state
      setAppointments(prev => {
        const cancelledAppointment = prev.upcoming.find(app => app._id === appointmentId);
        if (cancelledAppointment) {
          cancelledAppointment.status = 'cancelled';
          return {
            upcoming: prev.upcoming.filter(app => app._id !== appointmentId),
            previous: [cancelledAppointment, ...prev.previous]
          };
        }
        return prev;
      });

      toast.success('Appointment cancelled successfully!');
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      toast.error(error.message || 'Failed to cancel appointment. Please try again.');
    }
  };

  const handleBookDoctor = async () => {
    if (!selectedDoctor) {
      toast.warning("Please select a doctor first.");
      return;
    }
    if (!selectedDate) {
      toast.warning("Please select an appointment date.");
      return;
    }
    if (!selectedSlot) {
      toast.warning("Please select a time slot.");
      return;
    }

    try {
      // Log doctor availability information
      console.log("Selected Doctor:", selectedDoctor);
      console.log("Selected Doctor ID:", selectedDoctor._id || selectedDoctor.id);
      console.log("Selected Date:", selectedDate);
      console.log("Selected Time Slot:", selectedSlot);
      
      // Check if the slot exists in doctor's availability
      const slotExists = selectedDoctor.availability && 
        selectedDoctor.availability.some(slot => 
          slot.date === selectedDate && 
          slot.time === selectedSlot && 
          slot.isAvailable === true
        );
      
      console.log("Slot exists in doctor's availability:", slotExists);
      
      if (!slotExists) {
        console.log("Available slots for this doctor:", 
          selectedDoctor.availability ? 
          selectedDoctor.availability.filter(s => s.date === selectedDate) : 
          "No availability data"
        );
        // If in development mode, we can add a workaround
        if (process.env.NODE_ENV === 'development') {
          toast.warning("Attempting to book a slot that's not in the doctor's availability. This would normally fail.");
        }
      }

      // First check client-side for duplicate appointments
      const doctorId = selectedDoctor.id || selectedDoctor._id;
      const existingAppointment = appointments.upcoming.find(apt => {
        const aptDoctorId = apt.doctor._id || apt.doctor.id;
        const aptDate = new Date(apt.date).toISOString().split('T')[0];
        return aptDoctorId === doctorId && 
               aptDate === selectedDate && 
               apt.time === selectedSlot && 
               (apt.status === 'scheduled' || apt.status === 'pending');
      });

      if (existingAppointment) {
        toast.error("You already have an appointment scheduled with this doctor at this time.");
        return;
      }

      // Check server-side for duplicate appointments
      try {
        const appointmentData = {
          doctorId: doctorId,
          date: selectedDate,
          time: selectedSlot
        };
        
        console.log("Checking for duplicate appointment with data:", appointmentData);
        
        const checkResponse = await fetch(`http://localhost:5000/api/appointments/check-duplicate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await user.getIdToken()}`
          },
          body: JSON.stringify(appointmentData)
        });

        if (!checkResponse.ok) {
          const errorData = await checkResponse.json();
          throw new Error(errorData.message || 'Failed to check for duplicate appointments');
        }

        const checkData = await checkResponse.json();
        console.log("Duplicate check response:", checkData);
        
        if (checkData.isDuplicate) {
          toast.error("You already have an appointment scheduled with this doctor at this time.");
          return;
        }
      } catch (error) {
        console.error("Error checking for duplicate appointments:", error);
        toast.error(error.message || "Error checking for duplicate appointments. Please try again.");
        return;
      }

      console.log("Selected Doctor:", selectedDoctor);

      const appointmentData = {
        doctor: doctorId,
        date: selectedDate,
        time: selectedSlot,
        type: 'consultation',
        symptoms: selectedDoctor.expertise || selectedDoctor.specialization
      };

      console.log("Appointment Data:", appointmentData);

      const response = await fetch('http://localhost:5000/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify(appointmentData)
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Server returned non-JSON response:', await response.text());
        throw new Error('Server error. Please try again later.');
      }

      const responseData = await response.json();
      console.log("Response:", responseData);

      if (!response.ok) {
        if (responseData.availableDoctors) {
          console.log("Available doctors:", responseData.availableDoctors);
        }
        throw new Error(responseData.message || "Failed to book appointment");
      }

      // Update appointments state with the new appointment
      setAppointments(prev => ({
        upcoming: [...(prev.upcoming || []), {
          ...responseData.data,
          doctor: {
            name: selectedDoctor.name,
            specialization: selectedDoctor.expertise || selectedDoctor.specialization,
            experience: selectedDoctor.experience,
            rating: selectedDoctor.rating,
            image: selectedDoctor.image
          }
        }],
        previous: prev.previous || []
      }));

      setSelectedDoctor(null);
      setSelectedDate(null);
      setSelectedSlot(null);
      setSearchType(null);
      setIsBooking(false);

      toast.success("Appointment booked successfully!");
    } catch (error) {
      console.error("Error booking appointment:", error);
      toast.error(error.message || "Failed to book appointment. Please try again.");
    }
  };

  const handleSymptomsAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    
    if (!symptoms.trim()) {
      setError('Please describe your symptoms before analyzing');
      setIsAnalyzing(false);
      return;
    }

    try {
      const analysis = await analyzeSymptoms(symptoms);
      setAnalysisResult({
        specializations: analysis.specializations,
        explanations: analysis.explanations,
        urgency: analysis.urgency,
        symptoms: symptoms
      });
    } catch (error) {
      console.error('Error analyzing symptoms:', error);
      setError(error.message || 'Failed to analyze symptoms. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteAllDoctors = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/doctors/all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${await user.getIdToken()}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete doctors');
      }

      // Clear the available doctors list
      setAvailableDoctors([]);
      toast.success('All doctors have been deleted successfully');
    } catch (error) {
      console.error('Error deleting doctors:', error);
      toast.error('Failed to delete doctors. Please try again.');
    }
  };

  const features = [
    {
      icon: faComments,
      title: 'Instant Messaging',
      description: 'Real-time chat with your healthcare providers'
    },
    {
      icon: faCalendarAlt,
      title: 'Appointment Scheduling',
      description: 'Book and manage your medical appointments easily'
    },
    {
      icon: faPrescription,
      title: 'Digital Prescriptions',
      description: 'Access and manage your prescriptions digitally for convenience'
    }
  ];

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

  const handleStartVideoCall = () => {
    setShowVideoCall(true);
  };
  
  const handleCloseVideoCall = () => {
    setShowVideoCall(false);
  };

  return (
    <div className="dashboard">
      <ToastContainer position="top-right" autoClose={5000} />
      <aside className="dashboard-sidebar">
        <div className="user-profile">
          <FontAwesomeIcon icon={faUser} className="user-icon" />
          <h3>Welcome, {user?.displayName || 'User'}!</h3>
        </div>
        <nav className="dashboard-nav">
          <button 
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <FontAwesomeIcon icon={faUserMd} />
            <span>Overview</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'appointments' ? 'active' : ''}`}
            onClick={() => setActiveTab('appointments')}
          >
            <FontAwesomeIcon icon={faCalendarAlt} />
            <span>Appointments</span>
          </button>
          <button className="nav-item logout" onClick={handleLogout}>
            <FontAwesomeIcon icon={faSignOutAlt} />
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      <main className="dashboard-main">
        {activeTab === 'overview' ? (
          <>
        <header className="dashboard-header">
          <h1>BioNexa Healthcare Platform</h1>
          <p>Your gateway to modern healthcare solutions</p>
        </header>

          <section className="features-grid">
            {features.map((feature, index) => (
            <motion.div
              key={index}
              className="feature-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.2 }}
            >
              <FontAwesomeIcon icon={feature.icon} className="feature-icon" />
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </motion.div>
          ))}
          </section>
          </>
        ) : (
          <section className="appointments-section">
            <div className="appointments-container">
              {!isBooking ? (
                <>
                  <div className="appointments-header">
                    <div className="appointment-tabs">
                      <button 
                        className={`appointment-tab ${appointmentSubTab === 'upcoming' ? 'active' : ''}`}
                        onClick={() => setAppointmentSubTab('upcoming')}
                      >
                        Upcoming Appointments
                      </button>
                      <button 
                        className={`appointment-tab ${appointmentSubTab === 'previous' ? 'active' : ''}`}
                        onClick={() => setAppointmentSubTab('previous')}
                      >
                        Previous Appointments
                      </button>
                    </div>
                    <button className="book-appointment-btn" onClick={handleBookAppointment}>
                      <FontAwesomeIcon icon={faPlus} />
                      Book New Appointment
                    </button>
                  </div>
                  <div className="appointments-list">
                    {appointmentSubTab === 'upcoming' ? (
                      appointments.upcoming && appointments.upcoming.length > 0 ? (
                        appointments.upcoming.map((appointment) => (
                          <div key={appointment._id} className="appointment-card">
                            <div className="appointment-doctor">
                              <div className="doctor-info">
                                <h3>{appointment.doctor?.name || 'Doctor Name'}</h3>
                                <p className="doctor-specialization">{appointment.doctor?.specialization}</p>
                              </div>
                            </div>
                            
                            <div className="appointment-details">
                              <div className="detail-item">
                                <FontAwesomeIcon icon={faCalendarDay} className="icon" />
                                <div>
                                  <div className="label">Date</div>
                                  <div className="value">{new Date(appointment.date).toLocaleDateString()}</div>
                                </div>
                              </div>
                              <div className="detail-item">
                                <FontAwesomeIcon icon={faClockSolid} className="icon" />
                                <div>
                                  <div className="label">Time</div>
                                  <div className="value">{appointment.time}</div>
                                </div>
                              </div>
                              <div className="detail-item">
                                <FontAwesomeIcon icon={faStethoscope} className="icon" />
                                <div>
                                  <div className="label">Type</div>
                                  <div className="value">{appointment.type}</div>
                                </div>
                              </div>
                              <div className="detail-item">
                                <FontAwesomeIcon icon={faNotesMedical} className="icon" />
                                <div>
                                  <div className="label">Symptoms</div>
                                  <div className="value">{appointment.symptoms}</div>
                                </div>
                              </div>
                            </div>

                            <div className="appointment-actions">
                              <button 
                                className="cancel-btn"
                                onClick={() => handleCancelAppointment(appointment._id)}
                              >
                                <FontAwesomeIcon icon={faTimesCircle} />
                                Cancel Appointment
                              </button>
                              {isWithinThirtyMinutes(appointment.date, appointment.time) && appointment.status === 'scheduled' && (
                                <button 
                                  className="join-video-btn"
                                  onClick={() => {
                                    setCurrentAppointment(appointment);
                                    handleStartVideoCall();
                                  }}
                                >
                                  <FontAwesomeIcon icon={faVideo} />
                                  Join Video Call
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="no-appointments">
                          <p>No upcoming appointments</p>
                        </div>
                      )
                    ) : (
                      appointments.previous && appointments.previous.length > 0 ? (
                        appointments.previous.map((appointment) => (
                          <div key={appointment._id} className="appointment-card">
                            <div className="appointment-doctor">
                              <div className="doctor-info">
                                <h3>{appointment.doctor?.name || 'Doctor Name'}</h3>
                                <p className="doctor-specialization">{appointment.doctor?.specialization}</p>
                              </div>
                            </div>
                            
                            <div className="appointment-details">
                              <div className="detail-item">
                                <FontAwesomeIcon icon={faCalendarDay} className="icon" />
                                <div>
                                  <div className="label">Date</div>
                                  <div className="value">{new Date(appointment.date).toLocaleDateString()}</div>
                                </div>
                              </div>
                              <div className="detail-item">
                                <FontAwesomeIcon icon={faClockSolid} className="icon" />
                                <div>
                                  <div className="label">Time</div>
                                  <div className="value">{appointment.time}</div>
                                </div>
                              </div>
                              <div className="detail-item">
                                <FontAwesomeIcon icon={faStethoscope} className="icon" />
                                <div>
                                  <div className="label">Type</div>
                                  <div className="value">{appointment.type}</div>
                                </div>
                              </div>
                              <div className="detail-item">
                                <FontAwesomeIcon icon={faNotesMedical} className="icon" />
                                <div>
                                  <div className="label">Status</div>
                                  <div className={`appointment-status status-${appointment.status.toLowerCase()}`}>
                                    {appointment.status}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="no-appointments">
                          <p>No previous appointments</p>
                        </div>
                      )
                    )}
                  </div>
                </>
              ) : (
                <div className="booking-section">
                  <div className="booking-header">
                    <button className="back-button" onClick={handleBackToAppointments}>
                      <FontAwesomeIcon icon={faArrowLeft} />
                    </button>
                    <h2>Book New Appointment</h2>
                  </div>
                  {!searchType ? (
                    <div className="doctor-selection-cards">
                      <div className="selection-card">
                        <FontAwesomeIcon icon={faStethoscope} className="selection-icon" />
                        <h3>Search by Specialization</h3>
                        <p>Find doctors based on their medical specialization and expertise</p>
                        <button className="search-button" onClick={() => setSearchType('specialization')}>
                          <FontAwesomeIcon icon={faSearch} />
                          Search Doctors
                        </button>
                      </div>
                      <div className="selection-card">
                        <FontAwesomeIcon icon={faNotesMedical} className="selection-icon" />
                        <h3>Search by Symptoms</h3>
                        <p>Describe your symptoms and let AI find the right specialist for you</p>
                        <button className="search-button" onClick={() => setSearchType('symptoms')}>
                          <FontAwesomeIcon icon={faSearch} />
                          Search Doctors
                        </button>
                      </div>
                    </div>
                  ) : searchType === 'specialization' ? (
                    <div className="search-form">
                      <div className="search-header">
                        <button className="back-button" onClick={handleBackToSearchOptions}>
                          <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <h3>Select Doctor's Specialization</h3>
                      </div>
                      <div className="form-group">
                        <select 
                          className="specialization-select"
                          value={selectedSpecialization}
                          onChange={(e) => setSelectedSpecialization(e.target.value)}
                        >
                          <option value="">Choose a specialization</option>
                          {specializations.map((spec, index) => (
                            <option key={index} value={spec}>{spec}</option>
                          ))}
                        </select>
                      </div>
                      <button 
                        className="search-button"
                        onClick={handleSpecializationSearch}
                        disabled={!selectedSpecialization}
                      >
                        <FontAwesomeIcon icon={faSearch} />
                        Search Doctors
                      </button>
                    </div>
                  ) : searchType === 'doctors-list' ? (
                    <div className="doctors-list-container">
                      <div className="doctors-list-header">
                        <button className="back-button" onClick={handleBackToSearchOptions}>
                          <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <h3>Available Doctors</h3>
                        {userType === 'admin' && (
                          <button className="delete-all-doctors-btn" onClick={handleDeleteAllDoctors}>
                            Delete All Doctors
                          </button>
                        )}
                      </div>
                      {isLoadingDoctors ? (
                        <div className="loading">
                          <FontAwesomeIcon icon={faSpinner} className="fa-spin" />
                          Loading doctors...
                        </div>
                      ) : (
                        <div className="doctors-grid">
                          {availableDoctors.length > 0 ? (
                            availableDoctors.map((doctor) => (
                              <div key={doctor._id} className="doctor-card">
                                <div className="doctor-info">
                                  <div className="doctor-header">
                                    <h3 className="doctor-name">{doctor.name}</h3>
                                    <div className="doctor-rating">
                                      <FontAwesomeIcon icon={faStar} />
                                      {doctor.rating || 'N/A'}
                                    </div>
                                  </div>
                                  <div className="doctor-details">
                                    <div className="doctor-detail-item">
                                      <FontAwesomeIcon icon={faGraduationCap} />
                                      {doctor.education || 'Not specified'}
                                    </div>
                                    <div className="doctor-detail-item">
                                      <FontAwesomeIcon icon={faBriefcase} />
                                      {doctor.experience || 'Not specified'} experience
                                    </div>
                                    <div className="doctor-detail-item">
                                      <FontAwesomeIcon icon={faUsers} />
                                      {doctor.patients || 'Not specified'} patients treated
                                    </div>
                                  </div>
                                  <p className="doctor-description">{doctor.description || 'No description available'}</p>
                                  <div className="available-dates">
                                    <h4>Available Dates</h4>
                                    <div className="date-slots">
                                      {doctor.availability
                                        ?.filter(slot => {
                                          // Check both isAvailable flag and booking limits
                                          return slot.isAvailable && 
                                                 (!slot.isBooked) && 
                                                 (slot.currentBookings < (slot.patientLimit || 1));
                                        })
                                        .map(slot => slot.date)
                                        .filter((date, index, self) => self.indexOf(date) === index)
                                        .map(date => {
                                          const isSelected = selectedDate === date && activeDoctorId === doctor._id;
                                          return (
                                            <button
                                              key={date}
                                              className={`date-slot ${isSelected ? 'selected' : ''}`}
                                              onClick={() => handleDateSelect(date, doctor._id)}
                                            >
                                              {new Date(date).toLocaleDateString('en-US', {
                                                weekday: 'short',
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                              })}
                                            </button>
                                          );
                                        })}
                                    </div>
                                    {selectedDate && activeDoctorId === doctor._id && (
                                      <>
                                        <h4>Available Time Slots</h4>
                                        <div className="date-slots">
                                          {doctor.availability
                                            ?.filter(slot => 
                                              slot.date === selectedDate && 
                                              slot.isAvailable && 
                                              (!slot.isBooked) &&
                                              (slot.currentBookings < (slot.patientLimit || 1))
                                            )
                                            .map(slot => {
                                              const isSelected = selectedSlot === slot.time && activeDoctorId === doctor._id;
                                              return (
                                                <button
                                                  key={slot.time}
                                                  className={`date-slot ${isSelected ? 'selected' : ''}`}
                                                  onClick={() => handleSlotSelect(slot.time, doctor._id)}
                                                >
                                                  {slot.time}
                                                </button>
                                              );
                                            })}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  <button
                                    className="book-appointment"
                                    onClick={() => {
                                      setSelectedDoctor(doctor);
                                      if (selectedDate && selectedSlot && activeDoctorId === doctor._id) {
                                        handleBookDoctor();
                                      } else {
                                        toast.warning("Please select a date and time slot first.");
                                      }
                                    }}
                                    disabled={!selectedDate || !selectedSlot || activeDoctorId !== doctor._id}
                                  >
                                    Book Appointment
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="no-doctors-message">
                              <FontAwesomeIcon icon={faExclamationTriangle} />
                              <h3>No Verified Doctors Available</h3>
                              <p>There are currently no verified doctors available for {selectedSpecialization}. Please try another specialization or check back later.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="search-form">
                      <div className="search-header">
                        <button className="back-button" onClick={handleBackToSearchOptions}>
                          <FontAwesomeIcon icon={faArrowLeft} />
                        </button>
                        <h3>Describe Your Symptoms</h3>
                      </div>
                      {!analysisResult ? (
                        <>
                          <div className="form-group">
                            <textarea
                              className="symptoms-textarea"
                              placeholder="Please describe your symptoms in detail (e.g., fever, headache, chest pain)..."
                              value={symptoms}
                              onChange={(e) => setSymptoms(e.target.value)}
                              rows={6}
                            />
                          </div>
                          {error && <div className="error-message">{error}</div>}
                          <button 
                            className="search-button"
                            onClick={handleSymptomsAnalysis}
                            disabled={!symptoms.trim() || isAnalyzing}
                          >
                            {isAnalyzing ? (
                              <>
                                <FontAwesomeIcon icon={faSpinner} className="fa-spin" />
                                Analyzing Symptoms...
                              </>
                            ) : (
                              <>
                                <FontAwesomeIcon icon={faSearch} />
                                Analyze Symptoms
                              </>
                            )}
                          </button>
                        </>
                      ) : (
                        <div className="analysis-result">
                          <div className={`urgency-banner ${analysisResult.urgency.toLowerCase()}`}>
                            <FontAwesomeIcon icon={faExclamationTriangle} />
                            <span>Urgency Level: {analysisResult.urgency}</span>
                          </div>
                          <h4>Based on your symptoms:</h4>
                          <p className="symptoms-summary">{analysisResult.symptoms}</p>
                          <h4>Recommended Specializations:</h4>
                          <div className="specialization-list">
                            {analysisResult.specializations.map((spec, index) => (
                              <div key={index} className="specialization-item">
                                <div className="specialization-content">
                                  <FontAwesomeIcon icon={faStethoscope} />
                                  <span className="specialization-name">{spec}</span>
                                  <p className="specialization-explanation">{analysisResult.explanations[spec]}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          <button 
                            className="search-button"
                            onClick={() => setAnalysisResult(null)}
                          >
                            Try Again
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      {showVideoCall && currentAppointment && (
        <VideoCall
          appointment={currentAppointment}
          onClose={handleCloseVideoCall}
          role="patient"
        />
      )}
    </div>
  );
};

export default Dashboard;