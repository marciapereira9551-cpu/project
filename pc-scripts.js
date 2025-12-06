// PC Dashboard JavaScript
const SUPABASE_URL = "https://cqjeoslchevewbufpyzv.supabase.co";
const SUPABASE_KEY = "sb_publishable_PhMKOO9MpDZQIf5c624tiQ_AJPguAHp";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global State
let currentShift = 'evening'; // morning, evening, night
let currentHourPKT = null;
let pcData = {
  morning: {},
  evening: {},
  night: {}
};
let selectedActivity = 'working';

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
  initPCDashboard();
});

async function initPCDashboard() {
  // Initialize PC data
  await initializePCStations();
  
  // Start timers
  updatePKTTime();
  setInterval(updatePKTTime, 60000); // Update every minute
  
  // Load initial data
  await refreshPCDashboard();
  
  // Check for active window
  checkWindowStatus();
  setInterval(checkWindowStatus, 60000); // Check every minute
}

// Initialize PC stations in database if not exists
async function initializePCStations() {
  try {
    const { data, error } = await supabase
      .from('pc_stations')
      .select('*')
      .limit(1);
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      // Create default PC stations
      const stations = [
        { pc_number: 'PC1', station_name: 'Station Alpha', location: 'Main Hall', is_active: true },
        { pc_number: 'PC2', station_name: 'Station Beta', location: 'Main Hall', is_active: true },
        { pc_number: 'PC3', station_name: 'Station Gamma', location: 'Side Room', is_active: true },
        { pc_number: 'PC4', station_name: 'Station Delta', location: 'Side Room', is_active: true }
      ];
      
      const { error: insertError } = await supabase
        .from('pc_stations')
        .insert(stations);
      
      if (insertError) throw insertError;
      
      console.log('PC stations initialized');
    }
  } catch (error) {
    console.error('Error initializing PC stations:', error);
  }
}

// Update PKT time display
function updatePKTTime() {
  const now = new Date();
  const pktOffset = 5 * 60 * 60 * 1000; // PKT is UTC+5
  const pktTime = new Date(now.getTime() + pktOffset);
  
  const hours = pktTime.getUTCHours();
  const minutes = pktTime.getUTCMinutes();
  const seconds = pktTime.getUTCSeconds();
  
  // Determine current shift
  currentShift = getCurrentShift(hours);
  currentHourPKT = hours;
  
  const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} PKT`;
  document.getElementById('currentTimePKT').textContent = timeString;
  
  // Update shift display
  updateShiftDisplay();
}

// Determine current shift based on PKT hour
function getCurrentShift(hour) {
  if (hour >= 8 && hour < 16) return 'morning';
  if (hour >= 16 || hour < 0) return 'evening'; // 4 PM - 12 AM
  if (hour >= 0 && hour < 8) return 'night'; // 12 AM - 8 AM
  return 'evening';
}

// Update shift display
function updateShiftDisplay() {
  const shiftInfo = {
    morning: { icon: '🌅', name: 'Morning Shift', time: '8 AM - 4 PM' },
    evening: { icon: '🌇', name: 'Evening Shift', time: '4 PM - 12 AM' },
    night: { icon: '🌃', name: 'Night Shift', time: '12 AM - 8 AM' }
  };
  
  const current = shiftInfo[currentShift];
  const shiftElement = document.getElementById('currentShiftText');
  const iconElement = document.getElementById('currentShiftIcon');
  const timeElement = document.getElementById('currentShiftTime');
  
  shiftElement.textContent = current.name;
  iconElement.textContent = current.icon;
  timeElement.textContent = current.time;
  
  // Update shift indicator class
  const shiftIndicator = document.querySelector('.shift-indicator');
  shiftIndicator.className = `shift-indicator ${currentShift}`;
}

// Check window status (00-15 minutes)
function checkWindowStatus() {
  const now = new Date();
  const pktOffset = 5 * 60 * 60 * 1000;
  const pktTime = new Date(now.getTime() + pktOffset);
  
  const minutes = pktTime.getUTCMinutes();
  const windowElement = document.getElementById('windowStatus');
  const waveText = document.getElementById('waveText');
  const waveEmoji = document.querySelector('.wave-emoji');
  
  if (minutes >= 0 && minutes < 15) {
    // Window is active
    const remaining = 15 - minutes;
    windowElement.textContent = `Window: ${remaining}m remaining`;
    waveText.textContent = `Check-in open! (${remaining}m left)`;
    waveEmoji.style.animation = 'wave 2s infinite';
  } else {
    // Window is closed
    const nextHour = pktTime.getUTCHours() + 1;
    const nextWindow = `${nextHour % 12 || 12} ${nextHour >= 12 ? 'PM' : 'AM'}`;
    const minsToNext = 60 - minutes;
    
    windowElement.textContent = `Next window: ${nextWindow}`;
    waveText.textContent = `Next: ${nextWindow} (in ${minsToNext}m)`;
    waveEmoji.style.animation = 'none';
  }
}

// Refresh PC dashboard
async function refreshPCDashboard() {
  showLoading();
  
  try {
    // Load PC activity for current shift
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    const { data, error } = await supabase
      .from('pc_activity_log')
      .select('*')
      .eq('shift_type', currentShift)
      .gte('checkin_time_pkt', todayStart.toISOString())
      .lt('checkin_time_pkt', todayEnd.toISOString())
      .order('hour_slot', { ascending: true });
    
    if (error) throw error;
    
    // Process and display data
    await processPCActivityData(data);
    updatePCStats();
    
  } catch (error) {
    console.error('Error refreshing PC dashboard:', error);
    showNotification('Error loading PC data', 'error');
  } finally {
    hideLoading();
  }
}

// Process PC activity data
async function processPCActivityData(data) {
  // Group data by hour slot
  const hours = getShiftHours(currentShift);
  const pcList = ['PC1', 'PC2', 'PC3', 'PC4'];
  
  let gridHTML = '';
  
  for (const hour of hours) {
    const hourData = data?.filter(item => item.hour_slot === hour) || [];
    const hourStatus = {};
    let activeCount = 0;
    
    // Check each PC for this hour
    for (const pc of pcList) {
      const pcRecord = hourData.find(item => item.pc_number === pc);
      
      if (pcRecord) {
        if (pcRecord.activity_type === 'break') {
          hourStatus[pc] = {
            status: 'break',
            employee: pcRecord.employee_name,
            breakTime: pcRecord.break_minutes || 0
          };
        } else {
          hourStatus[pc] = {
            status: 'active',
            employee: pcRecord.employee_name
          };
          activeCount++;
        }
      } else {
        // Check if this hour is in the future or window is active
        const isFuture = isHourFuture(hour);
        const isWindowActive = isWindowActiveForHour(hour);
        
        if (isFuture) {
          hourStatus[pc] = { status: 'future' };
        } else if (isWindowActive) {
          hourStatus[pc] = { status: 'pending' };
        } else {
          hourStatus[pc] = { status: 'offline' };
        }
      }
    }
    
    // Calculate percentage
    const percentage = pcList.length > 0 ? Math.round((activeCount / pcList.length) * 100) : 0;
    
    // Add row to grid
    gridHTML += generatePCRow(hour, hourStatus, percentage);
  }
  
  document.getElementById('pcActivityGrid').innerHTML = gridHTML;
  
  // Update PC status cards
  updatePCStatusCards(pcList, data);
}

// Generate PC row HTML
function generatePCRow(hour, hourStatus, percentage) {
  const isCurrentHour = isCurrentHourSlot(hour);
  const rowClass = isCurrentHour ? 'pc-activity-row current-hour' : 'pc-activity-row';
  
  let rowHTML = `<div class="${rowClass}">`;
  rowHTML += `<div class="hour-cell">${hour}</div>`;
  
  // PC1-PC4 cells
  ['PC1', 'PC2', 'PC3', 'PC4'].forEach(pc => {
    const status = hourStatus[pc];
    let cellHTML = '';
    
    switch(status.status) {
      case 'active':
        cellHTML = `
          <div class="pc-cell active" onclick="viewPCDetails('${pc}', '${hour}')">
            <div class="pc-status">✅</div>
            <div class="pc-employee">${status.employee || 'Unknown'}</div>
          </div>
        `;
        break;
        
      case 'break':
        cellHTML = `
          <div class="pc-cell break" onclick="viewPCDetails('${pc}', '${hour}')">
            <div class="pc-status">⏸️</div>
            <div class="pc-employee">${status.employee || 'Unknown'}</div>
            <div class="pc-break-time">${status.breakTime}m</div>
          </div>
        `;
        break;
        
      case 'pending':
        cellHTML = `
          <div class="pc-cell pending" onclick="checkinForPC('${pc}', '${hour}')">
            <div class="pc-status">🔄</div>
            <div class="pc-employee">Click to check-in</div>
          </div>
        `;
        break;
        
      case 'future':
        cellHTML = `
          <div class="pc-cell">
            <div class="pc-status">─</div>
            <div class="pc-employee">Future</div>
          </div>
        `;
        break;
        
      default: // offline
        cellHTML = `
          <div class="pc-cell offline">
            <div class="pc-status">❌</div>
            <div class="pc-employee">Offline</div>
          </div>
        `;
    }
    
    rowHTML += cellHTML;
  });
  
  // Percentage cell
  let percentageClass = '';
  if (percentage === 100) percentageClass = 'pc-active';
  else if (percentage >= 50) percentageClass = 'pc-break';
  else percentageClass = 'pc-offline';
  
  rowHTML += `<div class="stats-cell ${percentageClass}">${percentage}%</div>`;
  rowHTML += '</div>';
  
  return rowHTML;
}

// Update PC status cards
async function updatePCStatusCards(pcList, activityData) {
  const currentHour = getCurrentHourSlot();
  const currentHourData = activityData?.filter(item => item.hour_slot === currentHour) || [];
  
  let cardsHTML = '';
  
  for (const pc of pcList) {
    const pcRecord = currentHourData.find(item => item.pc_number === pc);
    const stationData = await getPCStationInfo(pc);
    
    let status = 'offline';
    let employee = 'Vacant';
    let statusText = 'Offline';
    
    if (pcRecord) {
      if (pcRecord.activity_type === 'break') {
        status = 'break';
        employee = pcRecord.employee_name;
        statusText = `Break: ${pcRecord.break_minutes || 0}m`;
      } else {
        status = 'active';
        employee = pcRecord.employee_name;
        statusText = `Active`;
      }
    } else if (isWindowActiveForHour(currentHour)) {
      status = 'pending';
      statusText = 'Pending check-in';
    }
    
    cardsHTML += `
      <div class="pc-status-card ${status}">
        <div class="pc-name">${pc}</div>
        <div class="pc-station">${stationData?.station_name || 'Unknown Station'}</div>
        <div class="pc-current-user">${employee}</div>
        <div class="pc-current-status" style="background: var(--pc-${status}); color: white;">
          ${statusText}
        </div>
      </div>
    `;
  }
  
  document.getElementById('pcStatusCards').innerHTML = cardsHTML;
}

// Get PC station info
async function getPCStationInfo(pcNumber) {
  try {
    const { data, error } = await supabase
      .from('pc_stations')
      .select('*')
      .eq('pc_number', pcNumber)
      .single();
    
    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error getting PC info for ${pcNumber}:`, error);
    return null;
  }
}

// Update PC statistics
function updatePCStats() {
  // This would calculate actual stats from current data
  const activePCs = 3; // Example
  const breakPCs = 1; // Example
  const totalPCs = 4;
  const coverage = Math.round((activePCs / totalPCs) * 100);
  
  document.getElementById('pcStats').textContent = `🟢 ${activePCs}/${totalPCs} Active`;
  document.getElementById('breakStats').textContent = `⏸️ ${breakPCs} on break`;
  document.getElementById('coverageStats').textContent = `📊 ${coverage}% Coverage`;
}

// Show PC check-in modal
function showPCCheckinModal() {
  const modal = document.getElementById('pcCheckinModal');
  const title = document.getElementById('pcCheckinTitle');
  const currentHour = getCurrentHourSlot();
  
  title.textContent = `PC Check-in for ${currentHour}`;
  modal.style.display = 'block';
  
  // Pre-fill current hour and shift
  const hourInput = document.createElement('input');
  hourInput.type = 'hidden';
  hourInput.id = 'checkinHour';
  hourInput.value = currentHour;
  
  const shiftInput = document.createElement('input');
  shiftInput.type = 'hidden';
  shiftInput.id = 'checkinShift';
  shiftInput.value = currentShift;
  
  document.querySelector('.pc-checkin-form').appendChild(hourInput);
  document.querySelector('.pc-checkin-form').appendChild(shiftInput);
}

// Hide PC check-in modal
function hidePCCheckinModal() {
  document.getElementById('pcCheckinModal').style.display = 'none';
  resetCheckinForm();
}

// Reset check-in form
function resetCheckinForm() {
  document.getElementById('pcNumberSelect').value = '';
  document.getElementById('employeeNameInput').value = '';
  document.getElementById('pcCheckinNotes').value = '';
  selectActivity('working');
}

// Select activity type
function selectActivity(activity) {
  selectedActivity = activity;
  
  // Update button states
  document.querySelectorAll('.activity-btn').forEach(btn => {
    if (btn.dataset.activity === activity) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Update submit button text
  const submitBtn = document.getElementById('submitPCCheckinBtn');
  if (activity === 'break') {
    submitBtn.innerHTML = '<i class="fas fa-coffee"></i> Start Break';
  } else if (activity === 'handover') {
    submitBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Record Handover';
  } else {
    submitBtn.innerHTML = '<i class="fas fa-check"></i> Mark Active';
  }
}

// Submit PC check-in
async function submitPCCheckin() {
  const pcNumber = document.getElementById('pcNumberSelect').value;
  const employeeName = document.getElementById('employeeNameInput').value.trim();
  const notes = document.getElementById('pcCheckinNotes').value.trim();
  const hour = document.getElementById('checkinHour').value;
  
  if (!pcNumber) {
    showNotification('Please select a PC station', 'error');
    return;
  }
  
  if (!employeeName) {
    showNotification('Please enter your name', 'error');
    return;
  }
  
  const submitBtn = document.getElementById('submitPCCheckinBtn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  
  try {
    const now = new Date();
    const pktOffset = 5 * 60 * 60 * 1000;
    const pktTime = new Date(now.getTime() + pktOffset);
    
    const checkinData = {
      pc_number: pcNumber,
      employee_name: employeeName,
      activity_type: selectedActivity,
      shift_type: currentShift,
      hour_slot: hour,
      checkin_time_pkt: pktTime.toISOString(),
      notes: notes || null
    };
    
    if (selectedActivity === 'break') {
      checkinData.break_minutes = 0; // Will be updated when break ends
    }
    
    const { data, error } = await supabase
      .from('pc_activity_log')
      .insert([checkinData])
      .select();
    
    if (error) throw error;
    
    showNotification(`${employeeName} checked in at ${pcNumber}`, 'success');
    hidePCCheckinModal();
    
    // Refresh dashboard
    await refreshPCDashboard();
    
    // If break, show break management
    if (selectedActivity === 'break') {
      showBreakManagement(pcNumber, employeeName, data[0].id);
    }
    
  } catch (error) {
    console.error('Error submitting PC check-in:', error);
    showNotification('Error saving check-in: ' + error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-check"></i> Mark Active';
  }
}

// Show break management modal
function showBreakManagement(pcNumber, employeeName, activityId) {
  const modal = document.getElementById('breakModal');
  const content = document.getElementById('breakModalContent');
  
  content.innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      <div style="font-size: 3rem; margin-bottom: 1rem;">⏸️</div>
      <h3 style="margin-bottom: 1rem;">Break Started</h3>
      <p style="color: var(--text-secondary); margin-bottom: 2rem;">
        ${employeeName} is on break at ${pcNumber}
      </p>
      
      <div id="breakTimer" style="font-size: 2rem; font-weight: bold; color: var(--warning); margin-bottom: 2rem;">
        00:00
      </div>
      
      <div class="modal-buttons">
        <button class="btn btn-secondary" onclick="hideBreakModal()" style="margin-right: 1rem;">
          <i class="fas fa-times"></i> Close
        </button>
        <button class="btn btn-success" onclick="endBreak('${activityId}', '${pcNumber}', '${employeeName}')">
          <i class="fas fa-play"></i> End Break
        </button>
      </div>
    </div>
  `;
  
  modal.style.display = 'block';
  
  // Start break timer
  startBreakTimer();
}

// Start break timer
function startBreakTimer() {
  const timerElement = document.getElementById('breakTimer');
  let seconds = 0;
  
  const timer = setInterval(() => {
    seconds++;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, 1000);
  
  // Store timer ID for cleanup
  window.breakTimer = timer;
}

// End break
async function endBreak(activityId, pcNumber, employeeName) {
  try {
    // Clear timer
    if (window.breakTimer) {
      clearInterval(window.breakTimer);
      window.breakTimer = null;
    }
    
    // Calculate break duration
    const breakTime = parseInt(document.getElementById('breakTimer').textContent.split(':')[0]) || 0;
    
    // Update activity log
    const { error } = await supabase
      .from('pc_activity_log')
      .update({ 
        break_minutes: breakTime,
        checkout_time_pkt: new Date().toISOString()
      })
      .eq('id', activityId);
    
    if (error) throw error;
    
    // Record break session
    const now = new Date();
    const pktOffset = 5 * 60 * 60 * 1000;
    const breakEnd = new Date(now.getTime() + pktOffset);
    const breakStart = new Date(breakEnd.getTime() - (breakTime * 60 * 1000));
    
    const { error: breakError } = await supabase
      .from('pc_breaks')
      .insert([{
        pc_number: pcNumber,
        employee_name: employeeName,
        break_start_pkt: breakStart.toISOString(),
        break_end_pkt: breakEnd.toISOString(),
        duration_minutes: breakTime,
        shift_type: currentShift,
        reason: 'Regular break'
      }]);
    
    if (breakError) throw breakError;
    
    showNotification(`${employeeName} ended break at ${pcNumber} (${breakTime} minutes)`, 'success');
    hideBreakModal();
    await refreshPCDashboard();
    
  } catch (error) {
    console.error('Error ending break:', error);
    showNotification('Error ending break: ' + error.message, 'error');
  }
}

// Hide break modal
function hideBreakModal() {
  if (window.breakTimer) {
    clearInterval(window.breakTimer);
    window.breakTimer = null;
  }
  document.getElementById('breakModal').style.display = 'none';
}

// Check-in for specific PC
function checkinForPC(pcNumber, hour) {
  showPCCheckinModal();
  document.getElementById('pcNumberSelect').value = pcNumber;
  document.getElementById('checkinHour').value = hour;
}

// View PC details
function viewPCDetails(pcNumber, hour) {
  // Implement details view
  console.log(`Viewing details for ${pcNumber} at ${hour}`);
  // Could show a modal with detailed activity history for this PC
}

// Show different shift view
function showShiftView(shift) {
  currentShift = shift;
  updateShiftDisplay();
  refreshPCDashboard();
}

// Back to main dashboard
function backToMain() {
  window.location.href = 'index.html';
}

// Utility functions
function getShiftHours(shift) {
  const hours = {
    morning: ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM'],
    evening: ['4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM'],
    night: ['12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM', '7 AM']
  };
  return hours[shift] || hours.evening;
}

function getCurrentHourSlot() {
  const now = new Date();
  const pktOffset = 5 * 60 * 60 * 1000;
  const pktTime = new Date(now.getTime() + pktOffset);
  
  const hour = pktTime.getUTCHours();
  const isPM = hour >= 12;
  const displayHour = hour % 12 || 12;
  
  return `${displayHour} ${isPM ? 'PM' : 'AM'}`;
}

function isCurrentHourSlot(hour) {
  return hour === getCurrentHourSlot();
}

function isHourFuture(hour) {
  const current = getCurrentHourSlot();
  const hours = getShiftHours(currentShift);
  const currentIndex = hours.indexOf(current);
  const hourIndex = hours.indexOf(hour);
  
  return hourIndex > currentIndex;
}

function isWindowActiveForHour(hour) {
  if (isHourFuture(hour)) return false;
  
  const current = getCurrentHourSlot();
  if (hour !== current) return false;
  
  const now = new Date();
  const pktOffset = 5 * 60 * 60 * 1000;
  const pktTime = new Date(now.getTime() + pktOffset);
  
  const minutes = pktTime.getUTCMinutes();
  return minutes >= 0 && minutes < 15;
}

// Loading functions
function showLoading() {
  const grid = document.getElementById('pcActivityGrid');
  grid.innerHTML = `
    <div class="loading-grid">
      <div class="spinner"></div>
      <p>Loading PC activity data...</p>
    </div>
  `;
}

function hideLoading() {
  // Already handled in refresh function
}

// Notification function
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    z-index: 10000;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  
  if (type === 'success') notification.style.background = '#10b981';
  else if (type === 'error') notification.style.background = '#ef4444';
  else if (type === 'warning') notification.style.background = '#f59e0b';
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}
