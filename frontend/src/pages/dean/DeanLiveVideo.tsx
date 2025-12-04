import React, { useState, useEffect, useRef } from "react";
import {
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from "@mui/material";
import axios from "axios";
import DeanMain from "./DeanMain";
import { Tooltip } from "@mui/material";
import dayjs from "dayjs";



interface Schedule {
  courseTitle: string;
  courseCode: string;
  instructor: {
    first_name: string;
    last_name: string;
  };
  room: string;
  startTime: string;
  endTime: string;
  semesterStartDate: string;
  semesterEndDate: string;
  section: {
    course: string;
    section: string;
    block: string;
  };
  days: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
    sun: boolean;
  };
}

interface Log {
  _id: string;
  schedule: Schedule;
  date: string;
  status: string;
  timeIn?: string;
  timeout?: string;
  remarks: string;
  college: string | null;
  course: string;
}

function getTimeFromTick(hourIndex: number, tickIndex: number, minutesPerTick = 5): string {
  const baseHour = 6;
  const totalMinutes = (baseHour + hourIndex) * 60 + tickIndex * minutesPerTick;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${hour12}:${minute.toString().padStart(2, "0")} ${ampm}`;
}



const DeanLiveVideo: React.FC = () => {
  const [labs, setLabs] = useState<any[]>([]);
  const [selectedLab, setSelectedLab] = useState("Lab 1");
  const timelineRef = useRef<HTMLDivElement>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [currentMinutesSinceStart, setCurrentMinutesSinceStart] = useState<number | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);


  const CourseName = localStorage.getItem("course") ?? "";
  const ShortCourseName = CourseName.replace(/^bs/i, "").toUpperCase();

  const timeLabels = [
    "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM",
    "1 PM", "2 PM", "3 PM", "4 PM", "5 PM", "6 PM", "7 PM"
  ];


  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await axios.get('https://eduvision-dura.onrender.com/api/auth/logs/today');
        console.log('Fetched logs:', response.data);
        setLogs(response.data);
      } catch (error) {
        console.error('Error fetching logs:', error);
      }
    };

    fetchLogs();
  }, []);

  useEffect(() => {
    const updatePointer = () => {
      const now = dayjs();
      const startOfTimeline = now.startOf("day").hour(6).minute(0).second(0);
      const diffInMinutes = now.diff(startOfTimeline, "minute");
  
      if (diffInMinutes >= 0 && diffInMinutes <= 780) {
        setCurrentMinutesSinceStart(diffInMinutes);
      } else {
        setCurrentMinutesSinceStart(null);
      }
    };
  
    updatePointer();
  
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  
    const timeout = setTimeout(() => {
      updatePointer();
  
      const interval = setInterval(updatePointer, 60 * 1000);
  
      return () => clearInterval(interval);
    }, msUntilNextMinute);
  
    return () => clearTimeout(timeout);
  }, []);
  

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const response = await axios.post("https://eduvision-dura.onrender.com/api/auth/all-schedules/today", {
          shortCourseName: ShortCourseName
        });
        console.log("Received today data:", response.data);
        setSchedules(response.data);
      } catch (error) {
        console.error("Error fetching schedules:", error);
      }
    };
  
    fetchSchedules();
  }, [ShortCourseName]);

  useEffect(() => {
    const fetchLabs = async () => {
      try {
        const response = await axios.get("https://eduvision-dura.onrender.com/api/auth/rooms");
        setLabs(response.data);

        if (response.data.length > 0 && !selectedLab) {
          setSelectedLab(response.data[0].name);
        }
      } catch (error) {
        console.error("Error fetching labs:", error);
      }
    };

    fetchLabs();
  }, []);

  useEffect(() => {
    if (timelineRef.current && currentMinutesSinceStart !== null) {
      const tickHeight = 46.04;
      const scrollPosition = (currentMinutesSinceStart / 5) * tickHeight;
  
      timelineRef.current.scrollTop = scrollPosition - 100;
    }
  }, [currentMinutesSinceStart]);
  

  const handleLabChange = (event: SelectChangeEvent) => {
    setSelectedLab(event.target.value);
  };

  return (
    <DeanMain>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={4}
      >
        <Typography variant="h4" fontWeight="bold" color="#333">
          Live Face Recognition Feed
        </Typography>

        <FormControl variant="outlined" size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="lab-select-label">Select Lab</InputLabel>
          <Select
            labelId="lab-select-label"
            value={selectedLab}
            onChange={handleLabChange}
            label="Select Lab"
          >
            {labs.map((lab) => (
              <MenuItem key={lab._id} value={lab.name}>
                {lab.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box
        sx={{
          display: "flex",
          height: "70vh",
          mt: 4,
          width: "100%",
        }}
      >
        {/* Video Stream (2/3) */}
        <Box sx={{ flex: 2, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <img
            src="http://localhost:5001/video_feed"
            alt="Live Video Stream"
            style={{
              width: "100%",
              maxWidth: "800px",
              height: "100%",
              objectFit: "cover",
              borderRadius: "10px",
              boxShadow: "0px 4px 10px rgba(0,0,0,0.2)",
            }}
          />
        </Box>

        {/* Scrollable Timeline (1/3) */}
        <Box
          sx={{
            flex: 1,
            pl: 2,
            pr: 4,
            overflowY: "scroll",
            maxHeight: "100%",
            position: "relative",
          }}
          ref={timelineRef}
        >
          {currentMinutesSinceStart !== null && (
            <Box
              sx={{
                position: "absolute",
                right: "32px",
                width:"50%",
                top: `${(currentMinutesSinceStart / 5) * 46.02}px`,
                height: "2px",
                backgroundColor: "red",
                zIndex: 10,
              }}
            />
          )}

{logs.map((log) => {
  const time = log.timeIn ?? log.timeout;
  if (!time) return null;

  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  const totalMinutesSinceStart = (hour - 6) * 60 + minute;

  // Skip times outside the 6 AM – 7 PM window
  if (totalMinutesSinceStart < 0 || totalMinutesSinceStart > 780) return null;

  const topOffset = (totalMinutesSinceStart / 5) * 46.02;

  return (
    <Box
      key={log._id}
      sx={{
        position: "absolute",
        top: `${topOffset}px`,
        left: "0",
        right: "0",
        display: "flex",
        justifyContent: "flex-end",
        pr: 1,
        zIndex: 5,
      }}
    >
      <Box
        sx={{
          backgroundColor: "#E5383B",
          color: "white",
          px: 1.5,
          py: 0.5,
          fontSize: "12px",
          borderRadius: "4px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          maxWidth: "70%",
          wordWrap: "break-word",
        }}
      >
        {log.status}
      </Box>
    </Box>
  );
})}


          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {timeLabels.map((label, index) => (
              <Box key={index}>
                {[...Array(12)].map((_, tickIndex) => (
                  <React.Fragment key={`${index}-tick-${tickIndex}`}>
                    {/* Main tick (every 10min = 12 per hour) */}
                    <Box
                      sx={{
                        height: "6px",
                        display: "flex",
                        justifyContent: "flex-end",
                        alignItems: "center",
                      }}
                    >
                      {tickIndex === 0 ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography
                            variant="caption"
                            color="textSecondary"
                            noWrap
                            sx={{ minWidth: 100, textAlign: "right" }}
                            fontWeight="bold"
                          >
                            {(() => {
                              const schedule = schedules.find((sched) => {
                                const schedHour = parseInt(sched.startTime.split(":")[0]);
                                const isAM = schedHour < 12;
                                const hour12 = schedHour % 12 === 0 ? 12 : schedHour % 12;
                                const labelTime = `${hour12} ${isAM ? "AM" : "PM"}`;
                                return label === labelTime && sched.room === selectedLab;
                              });

                              return schedule
                                ? `${schedule.courseCode} - ${label}`
                                : label;
                            })()}
                          </Typography>
                          <Box
                            sx={{
                              width: "40px",
                              height: "2px",
                              backgroundColor: "#555",
                            }}
                          />
                        </Box>
                      ) : (
                        // Render short tick only if it's not after 7 PM
                        label !== "7 PM" && (
                          <Tooltip title={getTimeFromTick(index, tickIndex)} arrow placement="right">
                            <Box
                              data-time={getTimeFromTick(index, tickIndex)}
                              aria-label={`Time: ${getTimeFromTick(index, tickIndex)}`}
                              sx={{
                                width: "30px",
                                height: "1.5px",
                                backgroundColor: "#999",
                                cursor: "pointer",          // 👈 Helps with hover
                                minHeight: "2px",          // 👈 Expand hit area
                                position: "relative",       // 👈 Helps for tooltip positioning
                                "&:hover": {
                                  backgroundColor: "#333",  // 👈 Visual feedback (optional)
                                }
                              }}
                            />
                          </Tooltip>
                          
                        )
                      )}
                    </Box>

                    {/* Render mini ticks only if not after 7 PM and not last main tick */}
                    {label !== "7 PM" && tickIndex < 12 &&
                    [...Array(4)].map((_, miniIndex) => {
                      const minutesPerTick = 5;
                      const miniTickOffset = miniIndex + 1; // mini tick at +1 to +4 minutes
                      const timeString = getTimeFromTick(index, tickIndex, minutesPerTick) // base time
                        .split(":")
                        .map((val, i) => (i === 1 ? (parseInt(val) + miniTickOffset).toString().padStart(2, "0") : val))
                        .join(":")
                        .replace(/:(\d{2}) /, (_, m) => `:${Math.min(parseInt(m), 59)} `); // prevent 60+

                      return (
                        <Tooltip key={`${index}-tick-${tickIndex}-mini-${miniIndex}`} title={timeString} arrow placement="right">
                          <Box
                            sx={{
                              height: "6px",
                              display: "flex",
                              justifyContent: "flex-end",
                              alignItems: "center",
                              minHeight: "10px",
                              cursor: "pointer",
                            }}
                          >
                            <Box
                              sx={{
                                width: "20px",
                                height: "1px",
                                backgroundColor: "#ccc",
                                "&:hover": {
                                  backgroundColor: "#999",
                                }
                              }}
                            />
                          </Box>
                        </Tooltip>
                      );
                    })}

                  </React.Fragment>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </DeanMain>
  );
};

export default DeanLiveVideo;
