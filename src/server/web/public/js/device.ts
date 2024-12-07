// window.addEventListener("DOMContentLoaded", (e) => {
//     const accordions = document.querySelectorAll(".accordion-tab-content")
//     for (const accordion of accordions) {
//         const height = accordion.get
//     }
// })

const PAGINATION_CONTAINER = ".pagination";
const PAGINATION_HEADER = ".pagination-header";
const PAGINATION_BODY = ".pagination-body";

interface DataSource<T> {
    total(): number
    fetch(page: number, perPage: number): T[],

    template(data: T): HTMLElement
}

function paginate<T>(elem: string | HTMLElement, source: DataSource<T>, page: number, perPage: number) {
    let headerElem: Element, bodyElem: Element;
    
    if (typeof elem === "string") {
        const _elem = document.getElementById(elem);
        if (!_elem) throw new Error(`Unable to find paginator element with id '${elem}'.`);
        elem = _elem;

        const _headerElem = _elem.querySelector(PAGINATION_HEADER);
        if (!_headerElem) throw new Error(`Unable to find paginator header element within paginator with id '${_elem.id}'.`);
        headerElem = _headerElem;

        const _bodyElem = _elem.querySelector(PAGINATION_BODY);
        if (!_bodyElem) throw new Error(`Unable to find paginator body element within paginator with id '${_elem.id}'.`);
        bodyElem = _bodyElem;
    }

    const data = source.fetch(page, perPage);

    bodyElem!.innerHTML = "";
    headerElem!.innerHTML = ""; // REMOVE
    for (const elem of data) {
        const pageElem = source.template(elem);
        ;(() => [PAGINATION_CONTAINER,pageElem]);
    }
}

export {
    paginate
}