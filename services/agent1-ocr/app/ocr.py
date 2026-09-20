import os
import pytesseract
import fitz
import cv2
import numpy as np

from PIL import Image


# ============================================================
# Tesseract Configuration
# ============================================================

# If Tesseract is not in PATH, uncomment and adjust this:
#
# pytesseract.pytesseract.tesseract_cmd = (
#     r"C:\Program Files\Tesseract-OCR\tesseract.exe"
# )


# ============================================================
# Image Preprocessing
# ============================================================

def preprocess_image(image):
    """
    Preprocess image using OpenCV before Tesseract OCR.

    Processing steps:
    1. Convert to grayscale
    2. Upscale image
    3. Improve contrast using CLAHE
    4. Remove noise
    5. Sharpen text
    """

    image_np = np.array(image)

    # --------------------------------------------------------
    # PIL RGB -> OpenCV BGR
    # --------------------------------------------------------

    image_cv = cv2.cvtColor(
        image_np,
        cv2.COLOR_RGB2BGR
    )

    # --------------------------------------------------------
    # Convert to grayscale
    # --------------------------------------------------------

    gray = cv2.cvtColor(
        image_cv,
        cv2.COLOR_BGR2GRAY
    )

    # --------------------------------------------------------
    # Upscale image
    #
    # Important for small / handwritten characters.
    # --------------------------------------------------------

    scale = 2

    enlarged = cv2.resize(
        gray,
        None,
        fx=scale,
        fy=scale,
        interpolation=cv2.INTER_CUBIC
    )

    # --------------------------------------------------------
    # Improve local contrast
    # --------------------------------------------------------

    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    )

    enhanced = clahe.apply(
        enlarged
    )

    # --------------------------------------------------------
    # Remove small noise
    # --------------------------------------------------------

    denoised = cv2.fastNlMeansDenoising(
        enhanced,
        None,
        h=10,
        templateWindowSize=7,
        searchWindowSize=21
    )

    # --------------------------------------------------------
    # Sharpen text
    # --------------------------------------------------------

    sharpen_kernel = np.array([
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0]
    ])

    sharpened = cv2.filter2D(
        denoised,
        -1,
        sharpen_kernel
    )

    return sharpened


# ============================================================
# Generate OCR Variants
# ============================================================

def create_ocr_variants(image):
    """
    Creates multiple versions of the processed image.

    Different preprocessing methods can work better for
    different invoice qualities.
    """

    variants = []

    # --------------------------------------------------------
    # Variant 1: Enhanced grayscale
    #
    # Useful for handwritten text because thresholding can
    # sometimes destroy thin handwriting strokes.
    # --------------------------------------------------------

    variants.append(
        image
    )

    # --------------------------------------------------------
    # Variant 2: Adaptive threshold
    #
    # Useful for noisy / unevenly illuminated documents.
    # --------------------------------------------------------

    adaptive = cv2.adaptiveThreshold(
        image,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11
    )

    variants.append(
        adaptive
    )

    # --------------------------------------------------------
    # Variant 3: Otsu threshold
    #
    # Useful when foreground/background separation is clear.
    # --------------------------------------------------------

    _, otsu = cv2.threshold(
        image,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

    variants.append(
        otsu
    )

    return variants


# ============================================================
# OCR Confidence
# ============================================================

def calculate_confidence(data):
    """
    Calculates average Tesseract confidence.

    Tesseract returns confidence values for individual
    detected words. We use their average to choose the
    strongest OCR result.
    """

    confidences = []

    for confidence in data["conf"]:

        try:

            confidence_value = float(
                confidence
            )

            if confidence_value >= 0:
                confidences.append(
                    confidence_value
                )

        except (ValueError, TypeError):
            continue

    if not confidences:
        return 0.0

    return sum(confidences) / len(
        confidences
    )


# ============================================================
# Tesseract OCR
# ============================================================

def run_ocr(image):
    """
    Run Tesseract OCR using multiple configurations
    and return the result with the highest confidence.
    """

    best_text = ""
    best_confidence = -1

    # --------------------------------------------------------
    # Different page segmentation modes
    #
    # PSM 6  -> Single uniform block of text
    # PSM 11 -> Sparse text
    # --------------------------------------------------------

    configurations = [
        "--oem 3 --psm 6",
        "--oem 3 --psm 11"
    ]

    # --------------------------------------------------------
    # Create preprocessing variants
    # --------------------------------------------------------

    variants = create_ocr_variants(
        image
    )

    # --------------------------------------------------------
    # Run Tesseract on every combination
    # --------------------------------------------------------

    for variant in variants:

        for config in configurations:

            data = pytesseract.image_to_data(
                variant,
                config=config,
                output_type=pytesseract.Output.DICT
            )

            confidence = calculate_confidence(
                data
            )

            text = pytesseract.image_to_string(
                variant,
                config=config
            )

            if text and text.strip():

                if confidence > best_confidence:

                    best_confidence = confidence

                    best_text = text

    # --------------------------------------------------------
    # Return best OCR result
    # --------------------------------------------------------

    return best_text


# ============================================================
# Main OCR Function
# ============================================================

def extract_text(file_path: str):

    extracted_text = ""

    extension = os.path.splitext(
        file_path
    )[1].lower()

    # ========================================================
    # PDF
    # ========================================================

    if extension == ".pdf":
        document = fitz.open(file_path)
        try:
            # 1. Try extracting native digital text from the PDF pages first
            digital_pages = []
            has_digital_text = False

            for page_number, page in enumerate(document, start=1):
                raw_text = page.get_text("text").strip()
                if raw_text and len(raw_text) > 20:
                    has_digital_text = True
                    digital_pages.append(f"\n--- PAGE {page_number} ---\n{raw_text}\n")
                else:
                    digital_pages.append(None)

            # If all/most pages have digital text, use direct text extraction
            if has_digital_text and all(p is not None for p in digital_pages):
                print(f"Extracted native text directly from PDF ({len(''.join(digital_pages))} chars)")
                extracted_text = "".join(digital_pages)
            else:
                # 2. Scanned or mixed PDF: render pages and run Tesseract OCR
                print("Running OCR on PDF pages...")
                for page_number, page in enumerate(document, start=1):
                    # If page had good digital text, keep it
                    if digital_pages[page_number - 1]:
                        extracted_text += digital_pages[page_number - 1]
                        continue

                    print(f"Processing PDF page {page_number} with Tesseract...")
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                    image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

                    # Try OCR on preprocessed image
                    processed_image = preprocess_image(image)
                    page_text = run_ocr(processed_image)

                    # Fallback to direct raw image OCR if empty
                    if not page_text or not page_text.strip():
                        page_text = pytesseract.image_to_string(image, config="--oem 3 --psm 6")

                    extracted_text += f"\n--- PAGE {page_number} ---\n{page_text}\n"

        finally:
            document.close()

    # ========================================================
    # Images
    # ========================================================

    elif extension in [
        ".png",
        ".jpg",
        ".jpeg",
        ".bmp",
        ".tiff",
        ".tif"
    ]:

        image = Image.open(
            file_path
        ).convert("RGB")

        # ----------------------------------------------------
        # Image preprocessing
        # ----------------------------------------------------

        processed_image = preprocess_image(
            image
        )

        # ----------------------------------------------------
        # Tesseract OCR
        # ----------------------------------------------------

        extracted_text = run_ocr(
            processed_image
        )

    # ========================================================
    # Unsupported file
    # ========================================================

    else:

        raise Exception(
            f"Unsupported file type: {extension}"
        )

    return extracted_text