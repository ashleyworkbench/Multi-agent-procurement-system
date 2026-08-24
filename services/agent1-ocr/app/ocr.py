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

        document = fitz.open(
            file_path
        )

        try:

            for page_number, page in enumerate(
                document,
                start=1
            ):

                print(
                    f"Processing PDF page {page_number}..."
                )

                # ------------------------------------------------
                # Render PDF page at high resolution
                # ------------------------------------------------

                pix = page.get_pixmap(
                    matrix=fitz.Matrix(3, 3),
                    alpha=False
                )

                image = Image.frombytes(
                    "RGB",
                    [
                        pix.width,
                        pix.height
                    ],
                    pix.samples
                )

                # ------------------------------------------------
                # Image preprocessing
                # ------------------------------------------------

                processed_image = preprocess_image(
                    image
                )

                # ------------------------------------------------
                # Tesseract OCR
                # ------------------------------------------------

                page_text = run_ocr(
                    processed_image
                )

                extracted_text += (
                    f"\n--- PAGE {page_number} ---\n"
                )

                extracted_text += page_text

                extracted_text += "\n"

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