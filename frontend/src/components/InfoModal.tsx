import React, { useEffect, useState } from "react";
import {
  Modal,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  CircularProgress,
  IconButton,
  Avatar,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import PersonIcon from "@mui/icons-material/Person";
import CalendarHeatmap from "react-calendar-heatmap";
import Tooltip from "@mui/material/Tooltip";
import "react-calendar-heatmap/dist/styles.css";
import "./CustomHeatmap.css";
import axios from "axios";
import Swal from "sweetalert2";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import weekday from "dayjs/plugin/weekday";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
dayjs.extend(weekday);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(isBetween);
import AddManualScheduleModal from "./AddManualScheduleModal";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  faculty: any;
}

interface Schedule {
  courseCode: string;
  courseTitle: string;
  displaySection: string;
  days: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
  };
  startTime: string;
  endTime: string;
  room: string;
}

const InfoModal: React.FC<ModalProps> = ({ open, onClose, faculty }) => {
  const [schedules, setSchedules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const today = new Date();
  const startDate = new Date(today.getFullYear(), 0, 1);
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const [openAddManualModal, setOpenAddManualModal] = useState(false);

  const handleOpenAddManual = () => setOpenAddManualModal(true);
  const handleCloseAddManual = () => setOpenAddManualModal(false);

  const handleAddSchedule = async () => {
    const { value: file } = await Swal.fire({
      title: "Upload Schedule Document",
      input: "file",
      inputAttributes: {
        accept: ".doc,.docx",
        "aria-label": "Upload your teaching load document",
      },
      showCancelButton: true,
      confirmButtonText: "Upload",
      preConfirm: (file) => {
        if (!file) {
          Swal.showValidationMessage("You need to select a file");
        }
        return file;
      },
    });

    if (file) {
      const formData = new FormData();
      formData.append("scheduleDocument", file);

      try {
        const { data } = await axios.post(
          "https://eduvision-dura.onrender.com/api/auth/uploadScheduleDocument",
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          }
        );

        const scheduleData: Schedule[] = data.data;

        let tableHtml = `
          <table style="width:100%; border: 1px solid #ddd; border-collapse: collapse;">
            <thead>
              <tr>
                <th>Course Code</th>
                <th>Course Title</th>
                <th>Section</th>
                <th>Days</th>
                <th>Time</th>
                <th>Room</th>
              </tr>
            </thead>
            <tbody>
        `;

        scheduleData.forEach((schedule: Schedule) => {
          const days = Object.keys(schedule.days)
            .filter((day) => schedule.days[day as keyof typeof schedule.days])
            .join(", ");

          tableHtml += `
            <tr>
              <td>${schedule.courseCode}</td>
              <td>${schedule.courseTitle}</td>
              <td>${schedule.displaySection}</td>
              <td>${days}</td>
              <td>${schedule.startTime} – ${schedule.endTime}</td>
              <td>${schedule.room}</td>
            </tr>
          `;
        });

        tableHtml += `</tbody></table>`;

        const confirmResult = await Swal.fire({
          title: "Confirm upload schedule?",
          html: `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <p><strong>Instructor:</strong> ${data.instructorName}</p>
              <p><strong>Semester & AY:</strong> ${data.semester}, AY ${data.academicYear}</p>
            </div>
            ${tableHtml}
          `,
          showCancelButton: true,
          confirmButtonText: "Confirm Upload",
          width: 800,
          scrollbarPadding: false,
        });

        if (confirmResult.isConfirmed) {
          await axios.post("https://eduvision-dura.onrender.com/api/auth/confirmSchedules", {
            schedules: scheduleData,
          });

          Swal.fire({
            icon: "success",
            title: "Schedules Uploaded!",
            text: "The schedules have been successfully uploaded to the database.",
          });
        }
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          Swal.fire({
            icon: "error",
            title: "Upload Failed",
            text: error.response?.data?.message || "Something went wrong.",
          });
        } else {
          Swal.fire({
            icon: "error",
            title: "Upload Failed",
            text: "An unknown error occurred.",
          });
        }
      }
    }
  };

  useEffect(() => {
    const fetchSchedules = async () => {
      if (!faculty?._id) return;
      setIsLoading(true);

      try {
        const response = await axios.get(
          "https://eduvision-dura.onrender.com/api/auth/schedules-faculty",
          {
            params: { facultyId: faculty._id },
          }
        );
        console.log("Received schedule data:", response.data);
        setSchedules(response.data);
      } catch (error) {
        console.error("Error fetching schedules:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchedules();
  }, [faculty?._id]);

  useEffect(() => {
    const fetchLogs = async () => {
      if (!faculty?._id) return;

      try {
        const response = await axios.get(
          "https://eduvision-dura.onrender.com/api/auth/logs/faculty-today",
          {
            params: { facultyId: faculty._id },
          }
        );
        console.log("Received logs:", response.data);
        setLogs(response.data);
      } catch (error) {
        console.error("Error fetching logs:", error);
      }
    };

    fetchLogs();
  }, [faculty?._id]);

  if (!faculty) return null;

  const processLogsForHeatmap = () => {
    const logCounts: { [key: string]: number } = {};

    logs.forEach((log: any) => {
      const date = log.date;
      if (logCounts[date]) {
        logCounts[date] += 1;
      } else {
        logCounts[date] = 1;
      }
    });

    return Object.keys(logCounts).map((date) => ({
      date,
      count: logCounts[date],
    }));
  };

  const values = processLogsForHeatmap();

  const formatTime = (time24: string) => {
    if (!time24) return "";

    const [hourStr, minuteStr] = time24.split(":");
    let hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    hour = hour % 12 || 12;

    return `${hour}:${minute.toString().padStart(2, "0")}`;
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const facultyId = faculty._id;

    if (!file || !facultyId) return;

    const formData = new FormData();
    formData.append("image", file);
    formData.append("facultyId", facultyId);

    try {
      const res = await axios.post(
        "https://eduvision-dura.onrender.com/api/auth/upload-faculty-profile-photo",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (res.status === 200) {
        Swal.fire({
          icon: "success",
          title: "Photo Uploaded!",
          text: "Faculty profile photo has been updated.",
        });

        // Optional: Refresh the image or trigger a parent re-fetch
      }
    } catch (error) {
      console.error("Photo upload error:", error);
      Swal.fire({
        icon: "error",
        title: "Upload Failed",
        text: "There was an error uploading the photo.",
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      BackdropProps={{
        style: {
          backgroundColor: "rgba(0, 0, 0, 0.2)",
        },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          bgcolor: "#F8E5EE",
          boxShadow: 10,
          p: 4,
          maxWidth: 1100,
          width: "90%",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          color: "#211103",
        }}
      >
        <Box sx={{ position: "relative", mb: 2 }}>
          {/* Centered Faculty Info */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Typography variant="h5">
              Faculty Information of{" "}
              <span style={{ fontWeight: "bold", color: "#7B0D1E" }}>
                {`${faculty.last_name}, ${faculty.first_name}`}
              </span>
            </Typography>
          </Box>

          <Box
            sx={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <input
              type="file"
              accept="image/*"
              id="upload-photo"
              style={{ display: "none" }}
              onChange={handlePhotoUpload}
            />

            <label htmlFor="upload-photo">
              <IconButton component="span">
                <Avatar src={faculty.profilePhotoUrl || ""}>
                  {!faculty.profilePhotoUrl && <PersonIcon />}
                </Avatar>
              </IconButton>
            </label>
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            gap: 4,
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          {/* Left Column: Faculty Info and Heatmap */}
          <Box
            sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}
          >
            <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
              2nd Semester, AY 2024-2025
            </Typography>
            {/* Faculty Information Table */}
            <Box
              component={Paper}
              sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                position: "relative",
                backgroundColor: "#FFF",
                border: "1px solid #3D1308",
                borderRadius: 2,
              }}
            >
              <IconButton
                aria-label="edit faculty info"
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  color: "#7B0D1E",
                }}
                onClick={() => {
                  console.log("Edit clicked");
                }}
              >
                <EditIcon />
              </IconButton>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  Highest Educational Attainment:
                </Typography>
                <Typography variant="body1">
                  {faculty.highestEducationalAttainment}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  Academic Rank:
                </Typography>
                <Typography variant="body1">{faculty.academicRank}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  Status of Appointment:
                </Typography>
                <Typography variant="body1">
                  {faculty.statusOfAppointment}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  No. of Preparations:
                </Typography>
                <Typography variant="body1">{faculty.numberOfPrep}</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  Total Teaching Load:
                </Typography>
                <Typography variant="body1">
                  {faculty.totalTeachingLoad}
                </Typography>
              </Box>
            </Box>

            {/* Faculty Activity Heatmap */}
            <Box
              sx={{
                p: 2,
                border: "1px solid #3D1308",
                borderRadius: 2,
                backgroundColor: "#FFF",
                flexShrink: 0,
                height: "auto",
                textAlign: "center",
              }}
            >
              <Typography variant="h6">Faculty Activity</Typography>
              <CalendarHeatmap
                startDate={startDate}
                endDate={endDate}
                values={values}
                classForValue={(value) => {
                  if (!value || value.count === 0) {
                    return "color-empty";
                  }
                  return `color-github-${value.count}`;
                }}
                tooltipDataAttrs={(value) => {
                  if (value && value.date) {
                    return {
                      "data-tip": `${value.date}: ${value.count} activities`,
                    } as unknown as CalendarHeatmap.TooltipDataAttrs;
                  }
                  return {} as CalendarHeatmap.TooltipDataAttrs;
                }}
                showWeekdayLabels
              />
            </Box>
          </Box>

          {/* Right Column: Faculty Schedules */}
          <Box
            sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: "bold", mb: 1 }}>
                Teaching Load
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Tooltip title="Upload schedule manually" arrow>
                  <IconButton
                    sx={{ color: "#9F2042" }}
                    onClick={handleOpenAddManual}
                  >
                    <AddCircleOutlineIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Upload schedule by docx" arrow>
                  <IconButton
                    sx={{ color: "#9F2042" }}
                    onClick={handleAddSchedule}
                  >
                    <FileUploadIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
            {/* Faculty Schedules Table */}
            <TableContainer
              component={Paper}
              sx={{ maxHeight: 440, overflowY: "auto" }}
            >
              <Table size="small" aria-label="faculty schedules table">
                <TableHead>
                  <TableRow>
                    {["Course Code", "Days", "Time", "Section", "Room"].map(
                      (label) => (
                        <TableCell
                          key={label}
                          sx={{
                            fontWeight: "bold",
                            position: "sticky",
                            top: 0,
                            backgroundColor: "background.paper",
                            zIndex: 10,
                          }}
                        >
                          {label}
                        </TableCell>
                      )
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : schedules.length > 0 ? (
                    (
                      schedules as Array<{
                        startTime: string;
                        endTime: string;
                        [key: string]: any;
                      }>
                    )
                      .slice()
                      .sort((a, b) => a.startTime.localeCompare(b.startTime))
                      .map((schedule) => (
                        <TableRow key={schedule._id}>
                          <TableCell>{schedule.courseCode}</TableCell>
                          <TableCell>
                            {(() => {
                              const dayAbbreviations: {
                                [key: string]: string;
                              } = {
                                sun: "Su",
                                mon: "M",
                                tue: "T",
                                wed: "W",
                                thu: "Th",
                                fri: "F",
                                sat: "S",
                              };

                              return Object.entries(schedule.days)
                                .filter(([_, isActive]) => isActive)
                                .map(
                                  ([day]) =>
                                    dayAbbreviations[day.toLowerCase()] || ""
                                )
                                .join("");
                            })()}
                          </TableCell>
                          <TableCell>
                            {formatTime(schedule.startTime)} -{" "}
                            {formatTime(schedule.endTime)}
                          </TableCell>
                          <TableCell>
                            {schedule.section?.course} -{" "}
                            {schedule.section?.section}
                            {schedule.section?.block}
                          </TableCell>
                          <TableCell>{schedule.room}</TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No schedules yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>

        <Button
          variant="contained"
          onClick={onClose}
          sx={{
            mt: 2,
            backgroundColor: "#7B0D1E",
            "&:hover": { backgroundColor: "#9F2042" },
          }}
          fullWidth
        >
          Close
        </Button>
        <AddManualScheduleModal
          open={openAddManualModal}
          onClose={handleCloseAddManual}
          faculty={faculty}
        />
      </Box>
    </Modal>
  );
};

export default InfoModal;
