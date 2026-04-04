export const errorHandler = (err, _req, res, _next) => {
  if (!err) {
    return res.status(500).send({
      success: false,
      message: "Unknown server error",
    });
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).send({
      success: false,
      message: "File is too large. Max size is 80MB",
    });
  }

  return res.status(400).send({
    success: false,
    message: err.message || "Request error",
  });
};
