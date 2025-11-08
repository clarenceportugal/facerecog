import React, { useEffect, useRef, useState } from "react";
import {
  Typography,
  Box,
  IconButton,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
} from "@mui/material";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { Dayjs } from "dayjs";

import UserMain from "./UserMain";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import axios from "axios";
import { API_BASE_URL } from "../../utils/api";

interface ScheduleItem {
  courseCode: string;
  courseTitle: string;
  startTime: string;
  endTime: string;
  semesterStartDate: string;
  semesterEndDate: string;
  days: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
  };
  room?: string;
}

const FacultySchedule: React.FC = () => {
  const calendarRef = useRef<any>(null);

  const [events, setEvents] = useState<any[]>([]);
  const [labs, setLabs] = useState<{ _id: string; name: string; scheduleCount: number }[]>([]);
  const [allSchedules, setAllSchedules] = useState<ScheduleItem[]>([]);
  const [selectedLab, setSelectedLab] = useState<string>("");

  // Debug: Log labs state changes
  useEffect(() => {
    console.log("Labs state updated:", labs);
  }, [labs]);
  const [calendarView, setCalendarView] = useState<string>("timeGridWeek");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [currentSemesterInfo, setCurrentSemesterInfo] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);

  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(dayjs());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [currentTitle, setCurrentTitle] = useState<string>("");

  const handleViewChange = (event: any) => {
    const view = event.target.value;
    setCalendarView(view);
    calendarRef.current?.getApi().changeView(view);
    setCurrentTitle(calendarRef.current?.getApi().view?.title);
  };

  const handleDateSelect = (date: Dayjs | null) => {
    setSelectedDate(date);
    if (date) {
      calendarRef.current?.getApi().gotoDate(date.toDate());
      setCurrentTitle(calendarRef.current?.getApi().view?.title);
    }
  };

  const handlePrev = () => {
    calendarRef.current?.getApi().prev();
    setCurrentTitle(calendarRef.current?.getApi().view?.title);
  };

  const handleNext = () => {
    calendarRef.current?.getApi().next();
    setCurrentTitle(calendarRef.current?.getApi().view?.title);
  };

  useEffect(() => {
    if (calendarRef.current) {
      setCurrentTitle(calendarRef.current?.getApi().view?.title);
    }
  }, [calendarView]);

  // First, fetch all schedules to get available labs
  useEffect(() => {
    const fetchAllSchedules = async () => {
      try {
        setLoading(true);
        setError("");
        
        const facultyId = localStorage.getItem("userId");
        if (!facultyId) {
          setError("Faculty ID not found. Please log in again.");
          setLoading(false);
          return;
        }

        console.log("Fetching all schedules for facultyId:", facultyId);

        const { data } = await axios.get(
          `${API_BASE_URL}/api/auth/schedules-faculty`,
          { params: { facultyId } }
        );

        console.log("Raw schedule data:", data);

        if (!Array.isArray(data)) {
          console.warn("Expected array but got:", typeof data, data);
          setAllSchedules([]);
          setLoading(false);
          return;
        }

        // Filter schedules for current semester
        const currentDate = new Date();
        const currentSemesterSchedules = data.filter((schedule: ScheduleItem) => {
          const semesterStart = new Date(schedule.semesterStartDate);
          const semesterEnd = new Date(schedule.semesterEndDate);
          return currentDate >= semesterStart && currentDate <= semesterEnd;
        });

        // Get current semester info from the first current semester schedule
        if (currentSemesterSchedules.length > 0) {
          const firstSchedule = currentSemesterSchedules[0];
          setCurrentSemesterInfo({
            startDate: firstSchedule.semesterStartDate,
            endDate: firstSchedule.semesterEndDate
          });
        } else {
          setCurrentSemesterInfo(null);
        }

        console.log("Total schedules found:", data.length);
        console.log("Current semester schedules:", currentSemesterSchedules.length);
        console.log("Current date:", currentDate.toISOString().split('T')[0]);
        console.log("Current semester info:", currentSemesterInfo);

        setAllSchedules(currentSemesterSchedules);

        // Debug: Log all room values from current semester schedules
        const allRooms = currentSemesterSchedules.map((schedule: ScheduleItem) => schedule.room);
        console.log("All room values from current semester schedules:", allRooms);
        console.log("Filtered room values (non-empty):", allRooms.filter(Boolean));

        // Extract unique labs from current semester schedules only
        const roomCounts: { [key: string]: number } = {};
        currentSemesterSchedules.forEach((schedule: ScheduleItem) => {
          // Only count rooms that are not empty, null, undefined, or just whitespace
          if (schedule.room && typeof schedule.room === 'string' && schedule.room.trim().length > 0) {
            const roomName = schedule.room.trim();
            roomCounts[roomName] = (roomCounts[roomName] || 0) + 1;
          }
        });

        console.log("Room counts (labs with schedules):", roomCounts);
        console.log("Total unique labs found:", Object.keys(roomCounts).length);

        const uniqueLabs = Object.keys(roomCounts).map((labName, index) => ({
          _id: `lab-${index}`,
          name: labName,
          scheduleCount: roomCounts[labName]
        }));

        console.log("Available labs with schedules:", uniqueLabs);
        console.log("Total schedules found:", data.length);
        console.log("Unique labs extracted:", uniqueLabs.map(lab => lab.name));
        console.log("Final labs array that will be set:", uniqueLabs);
        
        setLabs(uniqueLabs);

        // Auto-select first lab if none selected
        if (uniqueLabs.length > 0 && !selectedLab) {
          setSelectedLab(uniqueLabs[0].name);
          console.log("Auto-selected lab:", uniqueLabs[0].name);
        }

      } catch (error) {
        console.error("Failed to load schedules:", error);
        setError("Failed to load schedules. Please try again.");
        setAllSchedules([]);
        setLabs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllSchedules();
  }, []);

  // Then, generate events for selected lab (already filtered for current semester)
  useEffect(() => {
    if (!selectedLab || allSchedules.length === 0) {
      setEvents([]);
      return;
    }

    const filteredSchedules = allSchedules.filter(
      (schedule: ScheduleItem) => schedule.room === selectedLab
    );

    console.log("Filtered schedules for lab", selectedLab, ":", filteredSchedules);
    console.log("Note: These are already filtered for current semester");

    const allEvents: any[] = [];

    filteredSchedules.forEach((schedule: ScheduleItem) => {
      const {
        startTime,
        endTime,
        semesterStartDate,
        semesterEndDate,
        courseTitle,
        courseCode,
        days,
        room,
      } = schedule;

      const startDate = new Date(semesterStartDate);
      const endDate = new Date(semesterEndDate);

      const daysMap = {
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
      };

      for (const [dayKey, dayNum] of Object.entries(daysMap)) {
        if (days[dayKey as keyof typeof days]) {
          let current = new Date(startDate);

          while (current <= endDate) {
            if (current.getDay() === dayNum) {
              const dateStr = current.toISOString().split("T")[0];
              allEvents.push({
                title:
                  calendarView === "dayGridMonth"
                    ? courseCode
                    : `${courseTitle} ${room ? `(${room})` : ""}`,
                start: `${dateStr}T${startTime}`,
                end: `${dateStr}T${endTime}`,
              });
            }
            current.setDate(current.getDate() + 1);
          }
        }
      }
    });

    console.log("Generated events:", allEvents);
    setEvents(allEvents);
  }, [selectedLab, calendarView, allSchedules]);


  return (
    <UserMain>
      <Box mb={3}>
        <Typography variant="h4" fontWeight={600}>
          My Schedule
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          Review and manage your teaching schedule.
          <span style={{ fontWeight: 600, color: "#1976d2" }}>
            {" "}(Current Semester Only)
          </span>
          {currentSemesterInfo && (
            <span style={{ fontWeight: 500, color: "#666" }}>
              {" "}- {new Date(currentSemesterInfo.startDate).toLocaleDateString()} to {new Date(currentSemesterInfo.endDate).toLocaleDateString()}
            </span>
          )}
          {labs.length > 0 && (
            <span style={{ fontWeight: 600, color: "#1976d2" }}>
              {" "}- {labs.length} lab{labs.length > 1 ? 's' : ''} with schedules
            </span>
          )}
        </Typography>
      </Box>

      <Box
        sx={{ backgroundColor: "#fff", borderRadius: 2, p: 2, boxShadow: 2 }}
      >
        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>Loading schedules...</Typography>
          </Box>
        )}

        {/* Custom Toolbar */}
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
            }}
          >
            {currentTitle}
            <IconButton
              color="primary"
              sx={{ ml: 1 }}
              onClick={() => setShowDatePicker(!showDatePicker)}
            >
              <CalendarTodayIcon />
            </IconButton>
            {showDatePicker && (
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  value={selectedDate}
                  onChange={handleDateSelect}
                  views={["year", "month", "day"]}
                  slotProps={{ textField: { size: "small" } }}
                  sx={{ ml: 1 }}
                />
              </LocalizationProvider>
            )}
            {selectedLab && (
              <Typography
                variant="caption"
                sx={{
                  ml: 2,
                  px: 1,
                  py: 0.5,
                  backgroundColor: "#e3f2fd",
                  color: "#1976d2",
                  borderRadius: 1,
                  fontWeight: 600,
                }}
              >
                {selectedLab}: {events.length} event{events.length !== 1 ? 's' : ''}
              </Typography>
            )}
          </Typography>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton onClick={handlePrev} color="primary">
              <ChevronLeftIcon />
            </IconButton>
            <IconButton onClick={handleNext} color="primary">
              <ChevronRightIcon />
            </IconButton>

             {labs.length > 0 && (
               <FormControl fullWidth sx={{ minWidth: 120 }}>
                 <InputLabel>Lab</InputLabel>
                 <Select
                   value={selectedLab}
                   onChange={(e) => setSelectedLab(e.target.value)}
                   label="Lab"
                 >
                   {labs.map((lab) => (
                     <MenuItem key={lab._id} value={lab.name}>
                       {lab.name} ({lab.scheduleCount} schedule{lab.scheduleCount > 1 ? 's' : ''})
                     </MenuItem>
                   ))}
                 </Select>
               </FormControl>
             )}

            <FormControl variant="outlined" sx={{ minWidth: 150 }}>
              <InputLabel>View</InputLabel>
              <Select
                label="View"
                name="view"
                value={calendarView}
                onChange={handleViewChange}
              >
                <MenuItem value="dayGridMonth">Month</MenuItem>
                <MenuItem value="timeGridWeek">Week</MenuItem>
                <MenuItem value="timeGridDay">Day</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Box>

        {!loading && events.length === 0 && !error ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            {labs.length === 0 ? (
              <>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No schedules found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  You don't have any schedules assigned for the current semester.
                </Typography>
                {currentSemesterInfo && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                    Current semester: {new Date(currentSemesterInfo.startDate).toLocaleDateString()} - {new Date(currentSemesterInfo.endDate).toLocaleDateString()}
                  </Typography>
                )}
              </>
            ) : (
              <>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No schedules found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  No schedules found for the selected lab: {selectedLab}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                  (Current semester only)
                </Typography>
              </>
            )}
          </Box>
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={calendarView}
            headerToolbar={false} // We use custom header
            slotMinTime="07:00:00"
            slotMaxTime="18:00:00"
            expandRows={true}
            selectable={true}
            editable={false}
            events={events}
          />
        )}
      </Box>
    </UserMain>
  );
};

export default FacultySchedule;
