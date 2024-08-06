const { sign } = require("crypto");
var fs = require("fs");
var path = require("path");
var PDFDocument = require("pdfkit");
var signpdf = require("@signpdf/signpdf").default;
var P12Signer = require("@signpdf/signer-p12").P12Signer;
var pdfkitAddPlaceholder =
  require("@signpdf/placeholder-pdfkit010").pdfkitAddPlaceholder;
const forge = require("node-forge");

// Function to extract details from PFX file
function extractPFXDetails(pfxFileBuffer, pfxPassword) {
  // Read the PFX file
  const pfxAsn1 = forge.asn1.fromDer(pfxFileBuffer.toString("binary"));

  // Decode the PFX
  const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, pfxPassword);

  // Get the certificate
  let cert;
  for (const safeContent of pfx.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (safeBag.cert) {
        cert = safeBag.cert;
        break;
      }
    }
    if (cert) break;
  }

  if (!cert) {
    console.log("No certificate found in PFX file");
    return;
  }

  // Extract details from the certificate
  const certDetails = cert.subject.attributes.reduce((acc, attr) => {
    acc[attr.name] = attr.value;
    return acc;
  }, {});

  console.log("Certificate Details:");
  console.log("Name:", certDetails.commonName);
  console.log("Contact Info:", certDetails.emailAddress || "N/A");

  // Extract and display the public key
  const publicKey = forge.pki.publicKeyToPem(cert.publicKey);
  console.log("Public Key:\n", publicKey);
  return {
    name: certDetails.commonName,
    contactInfo: certDetails.emailAddress,
  };
}

/**
 * Transform coordinates from top/left to bottom/left coordinate system
 */
function topLeftToBottomLeft(coords, page) {
  return [
    coords[0], // x1
    page.height - coords[1], // y1
    coords[2], // x2
    page.height - coords[3], // y2
  ];
}

// var signatureText = {
//     author: 'Anand Todkar',
//     reason: 'Showing off.',
//     contactInfo: 'signpdf@example.com',
//     name: 'Sign PDF',
//     location: 'The digital world.'
// };
function constructLabel(signatureText) {
  return `Signed by: ${signatureText.name}\nDate: ${new Date().toISOString()}`;
}

function addVisual(pdf, signatureText) {
  // Go to first page
  pdf.switchToPage(0);

  var margin = 40;
  var padding = 15;
  var label = constructLabel(signatureText);
  pdf.fillColor("#008B93").fontSize(8);
  var text = {
    width: pdf.widthOfString(label),
    height: pdf.heightOfString(label),
  };
  text.x = pdf.page.width - text.width - margin;
  text.y = pdf.page.height - text.height - margin;

  pdf.text(label, text.x, text.y, { width: text.width, height: text.height });

  return [
    text.x - padding,
    text.y - padding,
    text.x + text.width + padding,
    text.y + text.height + padding,
  ];
}

function signPdfUsingSigner(certificateBuffer, pin) {
  // Start a PDFKit document
  var pdf = new PDFDocument({
    autoFirstPage: false,
    size: "A4",
    layout: "portrait",
    bufferPages: true,
  });
  pdf.info.CreationDate = "";

  // At the end we want to convert the PDFKit to a string/Buffer and store it in a file.
  // Here is how this is going to happen:
  var pdfReady = new Promise(function (resolve) {
    // Collect the ouput PDF
    // and, when done, resolve with it stored in a Buffer
    var pdfChunks = [];
    pdf.on("data", function (data) {
      pdfChunks.push(data);
    });
    pdf.on("end", function () {
      resolve(Buffer.concat(pdfChunks));
    });
  });

  // Add some content to the page(s)
  pdf
    .addPage()
    .fillColor("#333")
    .fontSize(25)
    .moveDown()
    .text("This PDF is auto generated for testing of signature.");

  var signerInfo = extractPFXDetails(certificateBuffer, pin);
  var signer = new P12Signer(certificateBuffer, { passphrase: pin });

  // !!! ADDING VISUALS AND APPLYING TO SIGNATURE WIDGET ==>
  var signatureText = {
    name: signerInfo.name,
    reason: "Approved",
    contactInfo: signerInfo.contactInfo,
    location: "Pune",
  };
  // Add a some visuals and make sure to get their dimensions.
  var visualRect = addVisual(pdf, signatureText);
  // Convert these dimension as Widgets' (0,0) is bottom-left based while the
  // rest of the coordinates on the page are top-left.
  var widgetRect = topLeftToBottomLeft(visualRect, pdf.page);

  // Here comes the signing. We need to add the placeholder so that we can later sign.
  var refs = pdfkitAddPlaceholder({
    pdf: pdf,
    pdfBuffer: Buffer.from([pdf]), // FIXME: This shouldn't be needed.
    // signatureLength: 3000,
    signatureLength: 16000,
    widgetRect: widgetRect, // <== !!! This is where we tell the widget to be visible
    ...signatureText,
  });

  // <== !!! ADDING VISUALS AND APPLYING TO SIGNATURE WIDGET

  // `refs` here contains PDFReference objects to signature, form and widget.
  // PDFKit doesn't know much about them, so it won't .end() them. We need to do that for it.
  Object.keys(refs).forEach(function (key) {
    refs[key].end();
  });

  var retPromise = new Promise(function (resolve) {
    // Once the PDF is ready we need to sign it and eventually store it on disc.
    pdfReady
      .then(function (pdfWithPlaceholder) {
        console.log("Finished PDF.");
        return signpdf.sign(pdfWithPlaceholder, signer);
      })
      .then(function (signedPdf) {
        console.log("Signed PDF.");
        var targetPath = path.join(__dirname, "output.pdf");
        fs.writeFileSync(targetPath, signedPdf);
        resolve(targetPath);
      });
  });

  pdf.end();

  // Finally end the PDFDocument stream.
  // This has just triggered the `pdfReady` Promise to be resolved.
  return retPromise;
}

module.exports = signPdfUsingSigner;
