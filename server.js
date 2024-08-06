const express = require("express");
const multer = require("multer");
const bodyParser = require("body-parser");
const fs = require("fs");
const forge = require("node-forge");
const PDFDocument = require("pdfkit");
const path = require("path");
const signPdfUsingSigner = require("./pdf-signer");

const app = express();
const upload = multer({ dest: "uploads/" });

// Middleware to parse JSON and URL-encoded bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));

let pfxBuffer;
let pfxPassword;

// Endpoint to accept PFX file and paraphrase
app.post("/upload-pfx", upload.single("pfx"), (req, res) => {
  pfxBuffer = fs.readFileSync(req.file.path);
  pfxPassword = req.body.password;
  //fs.unlinkSync(req.file.path); // Delete the file after reading
  res.send("PFX file and paraphrase received.");
  //fs.writeFileSync( `./uploads/${req.file.path}`, pfxBuffer);
  fs.writeFileSync(`${req.file.path}-paraphrase`, pfxPassword);
});

// Endpoint to generate and sign PDF
app.post("/generate-pdf", (req, res) => {
  if (!pfxBuffer || !pfxPassword) {
    return res.status(400).send("PFX file and paraphrase not uploaded.");
  }

  signPDF(pfxBuffer, pfxPassword)
    .then((pdfPath) => {
      res.download(pdfPath, "signed_output.pdf", (err) => {
        if (err) {
          console.error(err);
        }
        fs.unlinkSync(pdfPath); // Delete the file after sending
      });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).send("Failed to sign PDF.");
    });

  // writeStream.on('finish', () => {
  //     // Sign the PDF
  //     signPDF(doc, pfxBuffer, pfxPassword)
  //         .then((pdfPath) => {
  //             res.download(pdfPath, 'signed_output.pdf', (err) => {
  //                 if (err) {
  //                     console.error(err);
  //                 }
  //                 //fs.unlinkSync(pdfPath); // Delete the file after sending
  //             });
  //         })
  //         .catch((err) => {
  //             console.error(err);
  //             res.status(500).send('Failed to sign PDF.');
  //         });
  // });
});

function signPDF(pfxBuffer, pfxPassword) {
  return new Promise((resolve, reject) => {
    // const pfxAsn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    // const p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, pfxPassword);

    // const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
    // const certBag = bags[forge.pki.oids.certBag][0];
    // const cert = certBag.cert;

    // const bagsKeys = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    // const keyBag = bagsKeys[forge.pki.oids.pkcs8ShroudedKeyBag][0];
    // const key = keyBag.key;

    //const pdfBufferToSign = fs.readFileSync(pdfPath);
    // var path = signPdfUsingSigner(pfxBuffer, pfxPassword).then((path) =>
    //   resolve(path)
    // );
    signPdfUsingSigner(pfxBuffer, pfxPassword)
      .then((pdfPath) => resolve(pdfPath))
      .catch((err) => reject(err));
    // Here you would implement the actual PDF signing logic with the certificate and key.
    // For simplicity, this example does not include the actual signing logic.

    //resolve(path);
  });
}

const port = 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
