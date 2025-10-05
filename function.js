// function.js
exports.handler = async (event) => {
  const keyword = event.queryStringParameters?.keyword || "nothing";
  const name = "Serina Oswalt";
  const message = `${name} says ${keyword}`;
  return {
    statusCode: 200,
    body: message,
  };
};
