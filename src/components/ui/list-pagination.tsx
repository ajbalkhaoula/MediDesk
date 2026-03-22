interface ListPaginationProps {
  page: number;
  maxPage: number;
  onPrevious: () => void;
  onNext: () => void;
}

const baseButtonClass =
  "inline-flex h-7 min-w-[78px] items-center justify-center rounded-[16px] border border-input bg-card px-2.5 text-xs font-medium leading-none transition-colors";

const ListPagination = ({ page, maxPage, onPrevious, onNext }: ListPaginationProps) => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={onPrevious}
        disabled={page <= 1}
        className={`${baseButtonClass} text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45`}
      >
        {"Pr\u00e9c\u00e9dent"}
      </button>

      <span className="text-sm font-medium text-foreground">
        Page {page}/{maxPage}
      </span>

      <button
        type="button"
        onClick={onNext}
        disabled={page >= maxPage}
        className={`${baseButtonClass} text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45`}
      >
        Suivant
      </button>
    </div>
  );
};

export default ListPagination;
