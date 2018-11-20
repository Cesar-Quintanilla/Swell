import * as store from '../store';
import * as actions from '../actions/actions';

const ReqResCtrl = {
  openConnectionArray:[],
  selectedArray:[],

  selectAllResReq() {
    const allResReq = document.body.querySelectorAll('.resreq-select');
    allResReq.forEach(resReq => {
      resReq.checked = true;
      this.logSelected(resReq.id)
    })
  },

  deselectAllResReq() {
    const allResReq = document.body.querySelectorAll('.resreq-select');
    this.selectedArray = [];
    allResReq.forEach(resReq => {
      resReq.checked = false;
      this.logSelected(resReq.id)
    })
  },

  logSelected(id) {
    const gotState = store.default.getState();
    const reqResArr = gotState.business.reqResArray;
    let reqResObj = reqResArr.find((el) => el.id == id);

    if (!reqResObj.checkSelected) {
      reqResObj.checkSelected = true;
      store.default.dispatch(actions.reqResUpdate(reqResObj));
      this.selectedArray.push(Number(id));
    } else if (reqResObj.checkSelected) {
      reqResObj.checkSelected = false;
      store.default.dispatch(actions.reqResUpdate(reqResObj));
      this.selectedArray = this.selectedArray.filter(item => item !== id);
      reqResObj.checkSelected = !reqResObj.checkSelected;
    }
  },

  /* Iterates across REQ/RES Array and opens connections for each object and passes each object to fetchController */
  openAllEndPoints(e) {
    const gotState = store.default.getState();
    const reqResArr = gotState.business.reqResArray;
    this.closeAllEndpoints(e);
    
    reqResArr.forEach(reqResObj => {
      const reqResId = reqResObj.id;
      if (this.selectedArray.includes(reqResId)) {
        this.setAbortCtrl(reqResId);
      }
    })
  },

  closeConnection(abortId) {
    const gotState = store.default.getState();
    const reqResArr = gotState.business.reqResArray;

    reqResArr.forEach((el) => {
      if(el.id == abortId) {
        el.connection = 'closed';
        store.default.dispatch(actions.reqResUpdate(el));
      }
    });
  },

  closeEndPoint(e, abortId, selected) {
    let reqResObj;
    this.openConnectionArray.forEach( el => {
        if (el.id == e.target.id) {
          reqResObj = el;
          this.closeConnection(el.id);
        }
    });

    reqResObj.abort.abort();
    const openConnectionObj = {
      abort: new AbortController(),
    }
    this.openConnectionArray.push(openConnectionObj);
  },

  /* Closes all open endpoint */
  closeAllEndpoints() {
    let selected = true
    this.openConnectionArray.forEach(abortObject => {
      if (this.selectedArray.includes(abortObject.id)) {
        this.selectedArray.forEach(abortId => {
          if (abortObject.id == abortId) {
            abortObject.abort.abort();
            const openConnectionObj = {
              abort : new AbortController(),
            }
            this.closeConnection(abortId)
          }
        })
      }
    });
  },

  clearAllEndPoints() {
    const gotState = store.default.getState();
    const reqResArr = gotState.business.reqResArray;
    store.default.dispatch(actions.reqResClear());
    this.closeAllEndpoints(e, all);

    reqResArr.forEach((el) => {
      if (el.id == e.target.id) {
        el.connection = 'closed';
        store.default.dispatch(actions.reqResUpdate(el));
      }
    });
  },

  setAbortCtrl(id) {
    const openConnectionObj = {
      abort : new AbortController(),
      id: id,
    }
    const gotState = store.default.getState();
    const reqResArr = gotState.business.reqResArray;
    // Search the store for the passed in ID
    const reqResObj = reqResArr.find((el) => el.id == openConnectionObj.id);
    this.openConnectionArray.push(openConnectionObj);
    this.parseReqObject (reqResObj, openConnectionObj.abort);
  },


  parseReqObject(object, abortController) {
    let { url, request: { method }, request: { headers }, request: { body } } = object;

    method = method.toUpperCase();
    
    let formattedHeaders = {};
    headers.forEach(head => {
      formattedHeaders[head.key] = head.value
    })

    // formattedHeaders["Access-Control-Allow-Origin"] = '*';

    let outputObj = {
      method: method,
      mode: "cors", // no-cors, cors, *same-origin
      cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
      credentials: "same-origin", // include, *same-origin, omit
      headers: formattedHeaders,
      redirect: "follow", // manual, *follow, error
      referrer: "no-referrer", // no-referrer, *client
    };

    if (method !== 'GET' && method !== 'HEAD') {
      outputObj.body = body;
    }

    this.fetchController(outputObj, url, object, abortController)
  },

  /* Utility function to open fetches */
  fetchController(parsedObj, url, originalObj, abortController) {
    let timeSentSnap = Date.now();

    const newObj = JSON.parse(JSON.stringify(originalObj));
    newObj.connection = 'pending';
    store.default.dispatch(actions.reqResUpdate(newObj));

    const signal = abortController.signal;

    parsedObj.signal = signal; 

    return fetch(url, parsedObj)
    .then(response => {
      let heads = {};

      for (let entry of response.headers.entries()) {
        heads[entry[0].toLowerCase()] = entry[1];
      }

      const contentType = heads['content-type'];
      const isStream = contentType.includes('stream');

      isStream ? this.handleSSE(response, originalObj, timeSentSnap, heads) : this.handleSingleEvent(response.json(), originalObj, timeSentSnap, heads);
    })
    .catch(err => console.log(err))
  },

  handleSingleEvent(response, originalObj, timeSentSnap, headers) {
    console.log('Handling Single Event')

    const newObj = JSON.parse(JSON.stringify(originalObj));

    response.then((res) => {
      newObj.connection = 'closed';
      newObj.connectionType = 'plain';
      newObj.timeSent = timeSentSnap;
      newObj.timeReceived = Date.now();
      newObj.response = {
        headers: headers,
        events: [],
      };

      newObj.response.events.push({
        data: res,
        timeReceived: Date.now(),
      });
      store.default.dispatch(actions.reqResUpdate(newObj));
    })
  },

  /* handle SSE Streams */
  handleSSE(response, originalObj, timeSentSnap, headers) {
    let reader = response.body.getReader();

    read();

    const newObj = JSON.parse(JSON.stringify(originalObj));

    newObj.timeSent = timeSentSnap;
    newObj.timeReceived = Date.now();
    newObj.response = {
      headers,
      events: [],
    };

    newObj.connection = 'open';
    newObj.connectionType = 'SSE';

    function read() {
      reader.read().then(obj => {
        if (obj.done) {
          return;
        } 

        //decode and recursively call
        else {
          let receivedEventFields = new TextDecoder("utf-8").decode(obj.value)
          //since the string is multi line, each for a different field, split by line
          .split('\n')
          //remove empty lines
          .filter(field => field != '')
          //massage fields so they can be parsed into JSON
          .map(field => {
            let fieldColonSplit = field
            .replace(/:/,'&&&&')
            .split('&&&&')
            .map(kv => kv.trim());

            let fieldObj = {
              [fieldColonSplit[0]] : fieldColonSplit[1],
            }

            return fieldObj;
          })
          .reduce((acc, cur) => {
            let key = Object.keys(cur)[0];
            if (acc[key]) {
              acc[key] = acc[key] + '\n' + cur[key];
            } else {
              acc[key] = cur[key];
            }
            return acc;
          },{})

          receivedEventFields.timeReceived = Date.now();
          
          newObj.response.events.push(receivedEventFields);

          store.default.dispatch(actions.reqResUpdate(newObj));
          read();
        }
      });
    }
  }
};


export default ReqResCtrl;
