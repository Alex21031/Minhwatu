from pathlib import Path

from PIL import Image, ImageDraw
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "cards" / "minhwatu" / "raw" / "Hwatu_overview.png"
OUTPUT_DIR = ROOT / "assets" / "cards" / "minhwatu" / "exported"


def find_runs(values: np.ndarray, threshold: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None

    for index, value in enumerate(values):
        if value >= threshold and start is None:
            start = index
        elif value < threshold and start is not None:
            runs.append((start, index - 1))
            start = None

    if start is not None:
        runs.append((start, len(values) - 1))

    return runs


def pair_card_bounds(runs: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if len(runs) % 2 != 0:
        raise ValueError(f"Expected an even number of border runs, got {len(runs)}")

    bounds: list[tuple[int, int]] = []
    for index in range(0, len(runs), 2):
        left = runs[index][0]
        right = runs[index + 1][1]
        bounds.append((left, right))

    return bounds


def compose_on_white_card(
    image: Image.Image, inset: int = 1, corner_radius: int = 9
) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size

    scale = 4
    mask = Image.new("L", (width * scale, height * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (
            inset * scale,
            inset * scale,
            width * scale - 1 - inset * scale,
            height * scale - 1 - inset * scale,
        ),
        radius=max(0, corner_radius * scale - inset * scale),
        fill=255,
    )
    mask = mask.resize((width, height), Image.Resampling.LANCZOS)

    base = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    base.putalpha(mask)
    return Image.alpha_composite(base, rgba)


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    pixels = np.array(image)

    red_mask = (
        (pixels[:, :, 0] > 220)
        & (pixels[:, :, 1] < 80)
        & (pixels[:, :, 2] < 80)
    )

    x_runs = find_runs(red_mask.sum(axis=0), threshold=500)
    y_runs = find_runs(red_mask.sum(axis=1), threshold=1000)
    x_bounds = pair_card_bounds(x_runs)
    y_bounds = pair_card_bounds(y_runs)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for row_index, (top, bottom) in enumerate(y_bounds, start=1):
        for col_index, (left, right) in enumerate(x_bounds, start=1):
            cropped = image.crop((left, top, right + 1, bottom + 1))
            cropped = compose_on_white_card(cropped)
            month = (row_index - 1) * 3 + ((col_index - 1) // 4) + 1
            card = ((col_index - 1) % 4) + 1
            target = OUTPUT_DIR / f"{month:02d}_{card}.png"
            cropped.save(target)

    print(f"Exported {len(x_bounds) * len(y_bounds)} cards to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
